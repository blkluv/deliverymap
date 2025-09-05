import { state } from './state.js';
import * as api from './api.js';
import * as auth from './auth.js';
import * as grid from './grid.js';
import * as map from './map.js';
import { allCategories, categoryColors, APPS_SCRIPT_URL } from './config.js';

/**
 * 顯示通知訊息
 * @param {string} message - 訊息內容
 * @param {'info'|'success'|'warning'|'error'} type - 訊息類型
 */
export function showNotification(message, type = 'info') {
    const $notification = $('#notification');
    $notification.text(message).removeClass('hidden bg-blue-500 bg-green-500 bg-red-500 bg-yellow-500');
    const colorClass = { error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500' }[type] || 'bg-blue-500';
    $notification.addClass(colorClass);
    setTimeout(() => $notification.addClass('hidden'), 5000);
}

/**
 * 填充篩選器和圖例的內容
 */
export function populateFiltersAndLegend() {
    const $categorySelect = $('#category-select');
    const $addCategorySelect = $('#add-category');
    const $legendContent = $('#legend-content');
    const $storeListFilters = $('#store-list-filters');
    
    $categorySelect.html('<option value="">所有分類</option>');
    $addCategorySelect.html('');
    $legendContent.html('');
    $storeListFilters.html('<button data-category="" class="store-filter-btn active bg-blue-600 text-white px-2 py-0.5 text-xs rounded-full mr-2 flex-shrink-0">全部</button>');
    
    allCategories.forEach(category => {
        $categorySelect.append(`<option value="${category}">${category}</option>`);
        $addCategorySelect.append($('<option>', { value: category, text: category }));
        if (map.legendIcons[category]) {
            $legendContent.append(`<div class="flex items-center"><img src="${map.legendIcons[category]}" class="h-4 w-4 mr-1.5">${category}</div>`);
        }
        $storeListFilters.append(`<button data-category="${category}" class="store-filter-btn text-nowrap bg-white text-black px-2 py-0.5 text-xs rounded-full mr-2 flex-shrink-0 border" style="border-color: ${categoryColors[category]};">${category}</button>`);
    });
}

/**
 * 應用篩選條件並更新地圖
 */
function applyFilters() {
    const category = $('#category-select').val();
    const keyword = $('#keyword-search').val();
    
    let results = state.allFeatures;
    if (keyword && state.fuse) {
        // 使用 pinyin-pro 進行拼音轉換
        const pinyinKeyword = pinyinPro.pinyin(keyword, { pattern: 'pinyin', toneType: 'none', removeNonZh: true });
        results = state.fuse.search(pinyinKeyword).map(result => result.item);
    }
    const finalFeatures = results.filter(feature => (!category || feature.get('category') === category));
    
    state.vectorSource.clear();
    state.vectorSource.addFeatures(finalFeatures);
    updateStoreList();
    $('#filter-modal').addClass('hidden');
}

/**
 * 更新地圖可視範圍內的店家列表
 */
export function updateStoreList() {
    if (!state.map || !state.clusterSource) return;
    const extent = state.map.getView().calculateExtent(state.map.getSize());
    const $listContent = $('#store-list-content');
    const activeCategory = $('#store-list-filters .active').data('category');
    $listContent.html('');
    
    const uniqueFeatures = new Map();
    state.clusterSource.forEachFeatureInExtent(extent, cluster => {
        cluster.get('features').forEach(feature => {
            if (!uniqueFeatures.has(feature.getId())) {
                uniqueFeatures.set(feature.getId(), feature);
            }
        });
    });

    Array.from(uniqueFeatures.values()).forEach(feature => {
        const category = feature.get('category');
        if (!activeCategory || category === activeCategory) {
            const address = feature.get('address');
            const shortAddress = map.formatAddress(address);
            const color = categoryColors[category] || categoryColors['其他'];
            const listItem = $(`<div class="flex items-center text-sm py-1.5 px-2 cursor-pointer hover:bg-gray-200 rounded-md"><span class="h-2.5 w-2.5 rounded-full mr-2 flex-shrink-0" style="background-color: ${color}"></span><span class="truncate">${shortAddress}</span></div>`);
            listItem.on('click', () => {
                const coordinates = feature.getGeometry().getCoordinates();
                state.map.getView().animate({ center: coordinates, zoom: 18, duration: 800 }, () => {
                    displayPopupForFeature(feature);
                });
            });
            $listContent.append(listItem);
        }
    });
}

/**
 * 處理新增/編輯表單提交
 * @param {Event} e - 表單提交事件
 */
function handleFormSubmit(e) {
    e.preventDefault();
    const $form = $(e.target);
    const $submitBtn = $form.find('button[type="submit"]');
    const formData = new FormData($form[0]);
    
    const isArea = $form.find('#add-is-area').is(':checked');
    let finalCoords;
    let areaBoundsStr = null;

    if (isArea) {
        if (state.selectedGridCells.size === 0) {
            showNotification('請在地圖網格上至少選取一個區塊。', 'error');
            return;
        }
        // ... (省略網格資料壓縮邏輯) ...
        finalCoords = state.lockedCenterForEditing || (state.isMobile ? state.tempMarker.getPosition() : state.map.getView().getCenter());
    } else {
        finalCoords = state.isMobile ? (state.tempMarker ? state.tempMarker.getPosition() : null) : state.map.getView().getCenter();
        if (!finalCoords) {
            showNotification('請在地圖上設定一個位置。', 'error');
            return;
        }
    }
    
    $submitBtn.prop('disabled', true).find('.submit-text').addClass('hidden').end().find('.spinner').removeClass('hidden');
    
    const lonLat = ol.proj.toLonLat(finalCoords);
    const isAreaUpdate = !!$form.find('#edit-area-row-index').val();
    const isPointUpdate = !!$form.find('#edit-row-index').val();

    let action = 'create';
    if (isAreaUpdate) action = 'user_update_area';
    else if (isPointUpdate) action = 'update';

    const newData = {
        action: action,
        rowIndex: $form.find('#edit-area-row-index').val() || $form.find('#edit-row-index').val(),
        originalName: $form.find('#edit-original-name').val(),
        userEmail: state.userProfile.email,
        lineUserId: state.userProfile.lineUserId,
        submitterName: state.currentUserDisplayName || 'N/A',
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

    fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(newData) })
        .then(res => res.json())
        .then(result => {
            if (result.status === 'success') {
                showNotification("資料已成功送出！感謝您的貢獻。", 'success');
                exitAddMode();
                setTimeout(() => api.loadData(), 2000);
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        }).catch(error => {
            showNotification(`送出失敗: ${error.message}`, 'error');
        }).finally(() => {
            $submitBtn.prop('disabled', false).find('.submit-text').removeClass('hidden').end().find('.spinner').addClass('hidden');
        });
}

/**
 * 進入地點新增模式 (桌面版)
 * @param {ol.Coordinate} coordinate 
 */
function enterDesktopAddMode(coordinate) {
    state.initialAddLocationCoords = coordinate;
    $('#app-container').addClass('desktop-add-mode');
    $('#desktop-center-marker').removeClass('hidden');
    
    setTimeout(() => {
        state.map.updateSize();
        state.map.getView().animate({ center: coordinate, zoom: 17, duration: 500 }, () => {
            const centerLonLat = ol.proj.toLonLat(state.map.getView().getCenter());
            api.reverseGeocode(centerLonLat[0], centerLonLat[1]);
        });
    }, 350);

    state.map.on('moveend', handleDesktopMapMove);
}

/**
 * 進入地點新增模式 (行動版)
 * @param {ol.Coordinate} coordinate 
 */
function enterMobilePlacementMode(coordinate) {
    state.initialAddLocationCoords = coordinate;
    if(state.tempMarker) state.map.removeOverlay(state.tempMarker);

    const markerEl = document.createElement('div');
    markerEl.className = 'new-location-marker';
    
    state.tempMarker = new ol.Overlay({
        element: markerEl, position: coordinate, positioning: 'bottom-center', stopEvent: false,
    });
    state.map.addOverlay(state.tempMarker);
    state.map.getView().animate({ center: coordinate, zoom: 18, duration: 500 });
    
    markerEl.addEventListener('pointerdown', (e) => {
        if ($('#mobile-add-area-tab').hasClass('active')) return;
        state.isDraggingMarker = true;
        state.map.getInteractions().forEach(i => { if(i instanceof ol.interaction.DragPan) i.setActive(false); });
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        e.stopPropagation();
    });
}

/**
 * 退出新增/編輯模式
 */
function exitAddMode() {
    if (state.isAreaSelectionMode) {
        grid.toggleAreaSelectionMode(false);
    }
    
    state.initialAddLocationCoords = null;
    state.lockedCenterForEditing = null;
    
    if (state.isMobile) {
        if(state.tempMarker) state.map.removeOverlay(state.tempMarker);
        state.tempMarker = null;
        $('#add-location-modal-mobile').addClass('hidden').removeClass('minimized');
        $('#restore-mobile-modal-btn').addClass('hidden');
    } else {
        $('#app-container').removeClass('desktop-add-mode');
        $('#desktop-center-marker').addClass('hidden');
        state.map.un('moveend', handleDesktopMapMove);
        setTimeout(() => state.map.updateSize(), 350);
    }
    $('#add-is-area').prop('checked', false);
    $('#edit-row-index, #edit-area-row-index, #edit-original-name').val('');
    api.loadData();
}

// 事件處理函式
function handleDesktopMapMove() {
    if ($('#app-container').hasClass('desktop-add-mode')) {
        const centerLonLat = ol.proj.toLonLat(state.map.getView().getCenter());
        api.reverseGeocode(centerLonLat[0], centerLonLat[1]);
    }
}
function handlePointerMove(e) {
    if (state.isDraggingMarker) {
        state.tempMarker.setPosition(state.map.getEventCoordinate(e));
    }
}
function handlePointerUp() {
    if (state.isDraggingMarker) {
        state.isDraggingMarker = false;
        state.map.getInteractions().forEach(i => { if(i instanceof ol.interaction.DragPan) i.setActive(true); });
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        const finalLonLat = ol.proj.toLonLat(state.tempMarker.getPosition());
        api.reverseGeocode(finalLonLat[0], finalLonLat[1], $('#add-location-form-mobile'));
    }
}

/**
 * 初始化所有 UI 事件監聽器
 */
export function initializeUI() {
    // Facebook 瀏覽器偵測
    (function() { /* ... */ })();
    // 清理 URL 參數
    (function() { /* ... */ })();
    
    // 主按鈕事件
    $('#add-location-btn').on('click', () => {
        if (!state.isLoggedIn) {
            showNotification('請先登入才能新增地點！', 'warning');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const mapCoords = ol.proj.fromLonLat([pos.coords.longitude, pos.coords.latitude]);
                state.isMobile ? enterMobilePlacementMode(mapCoords) : enterDesktopAddMode(mapCoords);
                if (state.isMobile) {
                    $('#add-location-modal-mobile').removeClass('hidden');
                    const lonLat = ol.proj.toLonLat(mapCoords);
                    api.reverseGeocode(lonLat[0], lonLat[1], $('#add-location-form-mobile'));
                }
            },
            () => {
                showNotification('無法取得您的位置，請手動選擇。', 'warning');
                const centerCoords = state.map.getView().getCenter();
                state.isMobile ? enterMobilePlacementMode(centerCoords) : enterDesktopAddMode(centerCoords);
                 if (state.isMobile) $('#add-location-modal-mobile').removeClass('hidden');
            }
        );
    });

    $('#search-address-btn, #open-filter-modal, #center-on-me-btn, #open-chat-btn').on('click', function() {
        const id = $(this).attr('id');
        if (id === 'search-address-btn') $('#search-panel').toggleClass('hidden');
        if (id === 'open-filter-modal') $('#filter-modal').removeClass('hidden');
        if (id === 'center-on-me-btn' && state.userPositionCoords) state.map.getView().animate({ center: state.userPositionCoords, zoom: 16 });
        if (id === 'open-chat-btn') {
             $('#chat-modal').removeClass('hidden');
             state.unreadChatCount = 0;
             $('#chat-unread-badge').addClass('hidden').text('');
        }
    });

    // 表單與 Modals
    $('#add-location-form, #add-location-form-mobile').on('submit', handleFormSubmit);
    $('#close-add-location-modal, #close-add-location-modal-mobile').on('click', exitAddMode);
    $('#filter-btn').on('click', applyFilters);
    $('#reset-btn').on('click', () => { $('#category-select, #keyword-search').val(''); applyFilters(); });
    $('.mobile-add-tab').on('click', function() { /* ... Tab切換邏輯 ... */ });
    
    // 其他 UI
    $('#store-list-filters').on('click', '.store-filter-btn', function() { /* ... 列表篩選邏輯 ... */ });
    state.map.on('singleclick', handleMapClick);
    state.map.on('moveend', updateStoreList);
}

/**
 * 處理地圖點擊事件
 * @param {ol.MapBrowserEvent} evt - 地圖事件
 */
function handleMapClick(evt) { /* ... */ }

/**
 * 為指定的 Feature 顯示 Popup
 * @param {ol.Feature} feature - 要顯示資訊的 Feature
 */
function displayPopupForFeature(feature) { /* ... */ }

// Popup 渲染函式...
function renderUnitListPopup(featureData, reportsByFullAddress) { /* ... */ }
function renderConsolidatedPopup(featureData, reports) { /* ... */ }
function renderVoteSection(featureData) { /* ... */ }

