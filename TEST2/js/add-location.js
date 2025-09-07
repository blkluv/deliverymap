/**
 * @file 負責「新增/編輯地點」功能的完整流程。
 */
import { showNotification, uiState } from './ui.js';
import * as api from './api.js';
import { getLoginStatus, getUserProfile } from './auth.js';
import { map, radiusSource } from './map.js';
import { toggleAreaSelectionMode, getSelectedGridCells, clearSelectedGridCells, setLockedCenterForEditing } from './grid.js';

// --- 模組內部狀態 ---
let initialAddLocationCoords = null;
let tempMarker = null; // 行動版上的可拖曳標記
let isDraggingMarker = false;
const isMobile = window.innerWidth < 768;
let areaBoundsForEditing = null; // 用於儲存編輯時的區域資料

/**
 * 進入行動版的地點放置模式。
 * @param {ol.Coordinate} coordinate - 初始座標。
 * @param {string|null} areaBoundsToLoad - (編輯模式) 要載入的區域邊界資料。
 */
export function enterMobilePlacementMode(coordinate, areaBoundsToLoad = null) {
    initialAddLocationCoords = coordinate;
    if(tempMarker) map.removeOverlay(tempMarker);

    const markerEl = document.createElement('div');
    markerEl.className = 'new-location-marker';
    
    tempMarker = new ol.Overlay({
        element: markerEl,
        position: coordinate,
        positioning: 'bottom-center',
        stopEvent: false,
    });
    map.addOverlay(tempMarker);

    if (areaBoundsToLoad) {
        areaBoundsForEditing = areaBoundsToLoad;
        $('#add-location-form-mobile').find('#add-is-area').prop('checked', true).trigger('change');
    } else {
        areaBoundsForEditing = null;
        drawRadiusCircle(coordinate);
        $('#complete-placement-btn').removeClass('hidden');
        map.getView().animate({ center: coordinate, zoom: 18, duration: 500 });
    }

    markerEl.addEventListener('pointerdown', handleMarkerDragStart);
}

/**
 * 進入桌面版的「新增/編輯」模式。
 * @param {ol.Coordinate} coordinate - 初始座標。
 * @param {string|null} areaBoundsToLoad - (編輯模式) 要載入的區域邊界資料。
 */
export function enterDesktopAddMode(coordinate, areaBoundsToLoad = null) {
    initialAddLocationCoords = coordinate;
    uiState.isDesktopAddMode = true;
    
    $('#app-container').addClass('desktop-add-mode');
    $('#desktop-center-marker').removeClass('hidden');

    if (areaBoundsToLoad) {
        areaBoundsForEditing = areaBoundsToLoad;
        $('#add-location-form').find('#add-is-area').prop('checked', true).trigger('change');
    } else {
        areaBoundsForEditing = null;
    }
    
    setTimeout(() => {
        map.updateSize();
        if (!areaBoundsToLoad) {
            drawRadiusCircle(coordinate);
        }
        map.getView().animate({ center: coordinate, zoom: 17, duration: 500 }, async () => {
            const centerLonLat = ol.proj.toLonLat(map.getView().getCenter());
            await reverseGeocodeAndUpdateForm(centerLonLat[0], centerLonLat[1]);
        });
    }, 350);

    map.on('moveend', handleDesktopMapMove);
}


/**
 * 退出「新增/編輯」模式。
 */
export function exitAddMode() {
    if (uiState.isDrawingOnGrid) {
        toggleAreaSelectionMode(false);
    }
    
    radiusSource.clear();
    initialAddLocationCoords = null;
    setLockedCenterForEditing(null);
    areaBoundsForEditing = null;
    
    if (isMobile) {
        if(tempMarker) map.removeOverlay(tempMarker);
        tempMarker = null;
        $('#complete-placement-btn').addClass('hidden');
        $('#add-location-modal-mobile').addClass('hidden').removeClass('minimized');
        $('#restore-mobile-modal-btn').addClass('hidden');
    } else {
        uiState.isDesktopAddMode = false;
        $('#app-container').removeClass('desktop-add-mode');
        $('#desktop-center-marker').addClass('hidden');
        map.un('moveend', handleDesktopMapMove);
        setTimeout(() => map.updateSize(), 350);
    }
    
    $('form[id^="add-location-form"]').find('#add-is-area').prop('checked', false);
    $('form[id^="add-location-form"]').find('#edit-row-index, #edit-area-row-index, #edit-original-name').val('');
    // 觸發資料刷新事件
    document.dispatchEvent(new CustomEvent('refresh-data'));
}

// --- 事件處理函式 ---

async function handleAddLocationClick() {
    if (!getLoginStatus()) {
        showNotification('請先登入才能新增地點！', 'warning');
        return;
    }
    showNotification('正在取得您的目前位置...');
    
    try {
        const position = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
        const coords = ol.proj.fromLonLat([position.coords.longitude, position.coords.latitude]);
        isMobile ? enterMobilePlacementMode(coords) : enterDesktopAddMode(coords);
    } catch (error) {
        showNotification('無法取得您的位置，請手動選擇。', 'warning');
        if (!isMobile) enterDesktopAddMode(map.getView().getCenter());
    }
}

async function handleCompletePlacementClick() {
    const finalCoords = tempMarker.getPosition();
    const finalLonLat = ol.proj.toLonLat(finalCoords);
    
    // 複製桌面版表單結構到行動版
    const formContent = $('#add-location-form > .px-6').children().clone(true, true);
    $('#mobile-point-fields').empty().append(formContent);
    $('#mobile-area-fields').empty().append(formContent.clone(true, true));
    
    // 調整不同 tab 的欄位顯示
    $('#mobile-area-fields').find('#add-category, #add-blacklist-category, #add-blacklist-reason').closest('div').hide();

    await reverseGeocodeAndUpdateForm(finalLonLat[0], finalLonLat[1], $('#add-location-form-mobile'));
    
    $('#mobile-add-point-tab').trigger('click');
    $('#minimize-mobile-modal-btn').addClass('hidden');
    $('#add-location-modal-mobile').removeClass('hidden');
    $('#complete-placement-btn').addClass('hidden');
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const $form = $(e.target);
    const $submitBtn = $form.find('button[type="submit"]');
    
    let finalCoords, areaBoundsStr = null;
    const isArea = $form.find('#add-is-area').is(':checked');

    if (isArea) {
        const selectedGridCells = getSelectedGridCells();
        if (selectedGridCells.size === 0) {
            showNotification('請在地圖網格上至少選取一個區塊。', 'error');
            return;
        }
        areaBoundsStr = compressGridData(selectedGridCells);
        finalCoords = map.getView().getCenter(); // 或使用 lockedCenterForEditing
    } else {
        finalCoords = isMobile ? tempMarker.getPosition() : map.getView().getCenter();
        if (!finalCoords) {
            showNotification('請在地圖上設定一個位置。', 'error');
            return;
        }
    }
    
    $submitBtn.prop('disabled', true).find('.submit-text').addClass('hidden').end().find('.spinner').removeClass('hidden');
    
    const lonLat = ol.proj.toLonLat(finalCoords);
    const profile = getUserProfile();
    const formData = new FormData($form[0]);
    const action = formData.get('areaRowIndex') ? 'user_update_area' : 
                   formData.get('rowIndex') ? 'admin_modify' : 
                   formData.get('originalName') ? 'update' : 'create';

    const payload = {
        action,
        rowIndex: formData.get('areaRowIndex') || formData.get('rowIndex'),
        originalName: formData.get('originalName'),
        userEmail: profile.email,
        lineUserId: profile.lineUserId,
        submitterName: profile.name || 'N/A',
        submitterEmail: profile.email || 'N/A',
        name: formData.get('address'),
        areaName: formData.get('areaName'),
        address: formData.get('address'),
        lon: lonLat[0],
        lat: lonLat[1],
        timestamp: new Date().toISOString(),
        areaBounds: areaBoundsStr,
        category: formData.get('category'),
        blacklistCategory: formData.get('blacklistCategory'),
        blacklistReason: formData.get('blacklistReason').trim(),
    };

    try {
        await api.submitLocation(payload);
        exitAddMode();
    } catch (error) {
        console.error("Submit failed:", error);
    } finally {
        $submitBtn.prop('disabled', false).find('.submit-text').removeClass('hidden').end().find('.spinner').addClass('hidden');
    }
}

async function handleAddressInputChange(e) {
    const address = $(e.target).val();
    if (!address) return;
    
    const data = await api.geocodeAddress(address);
    if (data?.results?.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = ol.proj.fromLonLat([location.lng, location.lat]);
        
        if (isMobile && tempMarker) tempMarker.setPosition(coords);
        else map.getView().setCenter(coords);
        
        map.getView().setZoom(17);
    } else {
        showNotification('找不到輸入的地址', 'error');
    }
}

async function handleDesktopMapMove() {
    if (uiState.isDesktopAddMode && !uiState.isDrawingOnGrid) {
        const centerCoords = map.getView().getCenter();
        const centerLonLat = ol.proj.toLonLat(centerCoords);
        await reverseGeocodeAndUpdateForm(centerLonLat[0], centerLonLat[1]);
    }
}

function handleMarkerDragStart(e) {
    if (uiState.isDrawingOnGrid) return;
    isDraggingMarker = true;
    document.addEventListener('pointermove', handleMarkerDrag);
    document.addEventListener('pointerup', handleMarkerDragEnd, { once: true });
    e.stopPropagation();
}

function handleMarkerDrag(e) {
    if (!isDraggingMarker) return;
    const newCoord = map.getEventCoordinate(e);
    tempMarker.setPosition(newCoord);
}

function handleMarkerDragEnd() {
    isDraggingMarker = false;
    document.removeEventListener('pointermove', handleMarkerDrag);
}


// --- 輔助函式 ---

async function reverseGeocodeAndUpdateForm(lon, lat, $form = $('#add-location-form')) {
    const data = await api.reverseGeocode(lon, lat);
    if (data?.results?.length > 0) {
        const results = data.results;
        $form.find('#add-address').val(results[0].formatted_address);
        
        const poi = results.find(r => r.types.includes('establishment') || r.types.includes('point_of_interest'));
        const nameComponent = poi?.address_components.find(c => c.types.includes('point_of_interest') || c.types.includes('premise'));
        $form.find('#add-area-name').val(nameComponent?.long_name || '');
    } else {
        $form.find('#add-address').val('無法自動定位地址');
        $form.find('#add-area-name').val('');
    }
}

function drawRadiusCircle(centerCoords) {
    radiusSource.clear();
    const radius = 500;
    const circle = new ol.geom.Circle(centerCoords, radius);
    const circleFeature = new ol.Feature(circle);
    radiusSource.addFeature(circleFeature);
}


function compressGridData(selectedGridCells) {
    const cellsArray = Array.from(selectedGridCells.entries());
    if (cellsArray.length === 0) return null;

    let minLon = Infinity, minLat = Infinity;
    cellsArray.forEach(([key]) => {
        const [lon, lat] = key.split('-').map(Number);
        minLon = Math.min(minLon, lon);
        minLat = Math.min(minLat, lat);
    });

    const origin = { lon: minLon, lat: minLat };
    const fillPalette = [], markerPalette = [];
    const fillMap = new Map(), markerMap = new Map();

    cellsArray.forEach(([, data]) => {
        if (data.fillColor && !fillMap.has(data.fillColor)) {
            fillMap.set(data.fillColor, fillPalette.length);
            fillPalette.push(data.fillColor);
        }
        if (data.markerColor && !markerMap.has(data.markerColor)) {
            markerMap.set(data.markerColor, markerPalette.length);
            markerPalette.push(data.markerColor);
        }
    });
    
    const palette = { f: fillPalette, m: markerPalette };
    const markerCharMap = { 'entrance': 'e', 'exit': 'x', 'table': 't', 'parking': 'p' };

    const compressedCells = cellsArray.map(([key, data]) => {
        const [lon, lat] = key.split('-').map(Number);
        const x = Math.round((lon - origin.lon) / 0.000033);
        const y = Math.round((lat - origin.lat) / 0.000033);
        const fillIndex = data.fillColor ? fillMap.get(data.fillColor) : '';
        const markerChar = data.marker ? markerCharMap[data.marker] : '';
        const markerColorIndex = data.markerColor ? markerMap.get(data.markerColor) : '';
        return `${x},${y}:${fillIndex}:${markerChar}:${markerColorIndex}`;
    });
    
    return JSON.stringify({
        v: 1,
        o: [origin.lon.toFixed(6), origin.lat.toFixed(6)],
        p: palette,
        c: compressedCells,
    });
}


/**
 * 初始化所有與「新增/編輯地點」相關的事件監聽器。
 */
export function setupAddLocationListeners() {
    $('#add-location-btn').on('click', handleAddLocationClick);
    $('#complete-placement-btn').on('click', handleCompletePlacementClick);
    $('#close-add-location-modal, #close-add-location-modal-mobile').on('click', exitAddMode);
    $('#add-location-form, #add-location-form-mobile').on('submit', handleFormSubmit);
    $(document).on('change', '#add-address', handleAddressInputChange);
    
    // 修正：新增對 #add-is-area 核取方塊的變動監聽器
    $(document).on('change', 'form[id^="add-location-form"] #add-is-area', function() {
        const isChecked = $(this).is(':checked');
        const form = $(this).closest('form');
        const isAreaEdit = !!(form.find('#edit-area-row-index').val());

        if (isChecked) {
            const center = isMobile && tempMarker ? tempMarker.getPosition() : map.getView().getCenter();
            if (isAreaEdit) {
                 setLockedCenterForEditing(center);
            }
            toggleAreaSelectionMode(true, isAreaEdit ? areaBoundsForEditing : null);
        } else {
            setLockedCenterForEditing(null);
            toggleAreaSelectionMode(false);
        }
    });
    
    $('#add-location-modal-mobile').on('click', '.mobile-add-tab', function() {
        const isAreaTab = $(this).is('#mobile-add-area-tab');
        $('.mobile-add-tab').removeClass('active text-indigo-600 bg-indigo-50').addClass('text-gray-500');
        $(this).addClass('active text-indigo-600 bg-indigo-50');
        $('#mobile-point-fields').toggleClass('hidden', isAreaTab);
        $('#mobile-area-fields').toggleClass('hidden', !isAreaTab);
        $('#minimize-mobile-modal-btn').toggleClass('hidden', !isAreaTab);
        
        const $isAreaCheckbox = $('#add-location-form-mobile').find('#add-is-area');
        if ($isAreaCheckbox.is(':checked') !== isAreaTab) {
            $isAreaCheckbox.prop('checked', isAreaTab).trigger('change');
        }
    });

    $('#minimize-mobile-modal-btn').on('click', () => {
        $('#add-location-modal-mobile').addClass('minimized');
        $('#restore-mobile-modal-btn').removeClass('hidden');
    });
    $('#restore-mobile-modal-btn').on('click', function() {
        $('#add-location-modal-mobile').removeClass('minimized');
        $(this).addClass('hidden');
    });
}

