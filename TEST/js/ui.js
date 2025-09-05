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
 * 為指定的 Feature 顯示 Popup
 * @param {ol.Feature} feature - 要顯示資訊的 Feature
 */
function displayPopupForFeature(feature) {
    const coordinates = feature.getGeometry().getCoordinates();
    state.currentFeatureData = feature.getProperties();
    
    const reportsByFullAddress = new Map();
    state.currentFeatureData.reports.forEach(report => {
        const fullAddr = report['地址'];
        if (!reportsByFullAddress.has(fullAddr)) {
            reportsByFullAddress.set(fullAddr, []);
        }
        reportsByFullAddress.get(fullAddr).push(report);
    });

    if (reportsByFullAddress.size > 1) {
        renderUnitListPopup(state.currentFeatureData, reportsByFullAddress);
    } else {
        renderConsolidatedPopup(state.currentFeatureData, state.currentFeatureData.reports);
    }
    state.infoOverlay.setPosition(coordinates);
}


// --- Popup 渲染函式 ---

function renderUnitListPopup(featureData, reportsByFullAddress) {
    const shortAddress = map.formatAddress(featureData.address);
    const sortedAddresses = Array.from(reportsByFullAddress.keys()).sort((a, b) => a.localeCompare(b, 'zh-Hant-TW-u-kn-true'));

    let listHtml = sortedAddresses.map(fullAddr => {
        const addrMatch = fullAddr.match(/(\d.*)/);
        const displayAddr = addrMatch ? addrMatch[1].trim() : fullAddr;
        return `<li class="border-t py-2 px-1 cursor-pointer hover:bg-gray-100 rounded unit-item" data-address="${encodeURIComponent(fullAddr)}"><p class="font-semibold truncate" title="${fullAddr}">${displayAddr}</p></li>`;
    }).join('');

    $('#popup-content').html(`
        <h3 class="text-lg font-bold text-gray-800">${shortAddress}</h3>
        ${renderVoteSection(featureData)}
        <p class="text-sm text-gray-600 my-2 border-t pt-2">此地點有多筆回報，請選擇查看：</p>
        <ul class="text-sm max-h-40 overflow-y-auto custom-scrollbar pr-2">${listHtml}</ul>
    `);
}

function renderConsolidatedPopup(featureData, reports) {
    const shortAddress = map.formatAddress(reports[0]['地址']);
    let reportsHtml = reports.map(report => {
        const dateString = report.timestamp ? new Date(report.timestamp).toLocaleDateString('zh-TW') : '日期不明';
        return `
            <div class="border-t pt-2 mt-2">
                <p class="text-xs text-gray-500">${report.submitterName || '匿名'} &bull; ${dateString}</p>
                <p class="font-semibold">${report['黑名類別']}</p>
                <p class="whitespace-pre-wrap">${report['黑名原因'] || ''}</p>
            </div>`;
    }).join('');

    $('#popup-content').html(`
        <h3 class="text-lg font-bold text-gray-800">${shortAddress}</h3>
        ${renderVoteSection(featureData)}
        <div class="text-sm mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">${reportsHtml}</div>
    `);
}

function renderVoteSection(featureData) {
    const { likes = 0, dislikes = 0, address: locationId } = featureData;
    const score = likes - dislikes;
    const scoreColor = score > 0 ? 'text-green-600' : (score < 0 ? 'text-red-600' : 'text-gray-600');
    const userVote = state.userVotes[locationId];

    return `
        <div class="flex items-center justify-between text-sm mt-2">
            <span>總評分 (<span class="score-display ${scoreColor} font-bold">${score}</span>)</span>
            <div class="flex items-center space-x-2">
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${userVote === 'like' ? 'voted-like' : ''}" data-location-id="${locationId}" data-vote-type="like">
                    <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333V17a1 1 0 001 1h6.364a1 1 0 00.949-.684l2.121-6.364A1 1 0 0015.364 9H12V4a1 1 0 00-1-1h-1a1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.4 10.333zM6 8h2.545M5 10.5a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 013 0v3a1.5 1.5 0 01-1.5 1.5z"/></svg>
                </button>
                <span class="likes-count text-sm text-gray-600">${likes}</span>
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${userVote === 'dislike' ? 'voted-dislike' : ''}" data-location-id="${locationId}" data-vote-type="dislike">
                     <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667V3a1 1 0 00-1-1h-6.364a1 1 0 00-.949.684L3.565 9H6v7a1 1 0 001 1h1a1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.6-4.8zM14 12h-2.545M15 9.5a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-3 0v-3a1.5 1.5 0 011.5 1.5z"/></svg>
                </button>
                <span class="dislikes-count text-sm text-gray-600">${dislikes}</span>
            </div>
        </div>`;
}

// --- 新增/編輯地點相關函式 ---

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
        // ... (網格資料壓縮邏輯) ...
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
        state.dragPanInteraction.setActive(false);
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp, { once: true });
        e.stopPropagation();
    });
}

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

// --- 事件處理函式 ---

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
        state.dragPanInteraction.setActive(true);
        document.removeEventListener('pointermove', handlePointerMove);
        const finalLonLat = ol.proj.toLonLat(state.tempMarker.getPosition());
        api.reverseGeocode(finalLonLat[0], finalLonLat[1], $('#add-location-form-mobile'));
    }
}

function handleMapClick(evt) {
    if (state.isAreaSelectionMode || $('#app-container').hasClass('desktop-add-mode')) return;
    
    let featureClicked = false;
    state.map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
        if (featureClicked) return;
        
        const clusterFeatures = feature.get('features');
        if (clusterFeatures) {
            featureClicked = true;
            if (clusterFeatures.length > 1) {
                const extent = ol.extent.createEmpty();
                clusterFeatures.forEach(f => ol.extent.extend(extent, f.getGeometry().getExtent()));
                state.map.getView().fit(extent, { duration: 500, padding: [80, 80, 80, 80] });
            } else {
                displayPopupForFeature(clusterFeatures[0]);
            }
        }
    }, { hitTolerance: 5 });

    if (!featureClicked) {
        state.infoOverlay.setPosition(undefined);
    }
}

/**
 * 初始化所有 UI 事件監聽器
 */
export function initializeUI() {
    // Facebook 瀏覽器偵測
    if (navigator.userAgent.toLowerCase().includes("fban")) {
        $('#facebook-blocker-modal').css('display', 'flex');
    }
    // 清理 URL 參數
    if (new URL(window.location).searchParams.has('fbclid')) {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
    
    // --- 主按鈕事件 ---
    $('#add-location-btn').on('click', () => {
        if (!state.isLoggedIn) {
            showNotification('請先登入才能新增地點！', 'warning');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const mapCoords = ol.proj.fromLonLat([pos.coords.longitude, pos.coords.latitude]);
                const action = state.isMobile ? enterMobilePlacementMode : enterDesktopAddMode;
                action(mapCoords);
                if (state.isMobile) {
                    $('#add-location-modal-mobile').removeClass('hidden');
                    const lonLat = ol.proj.toLonLat(mapCoords);
                    api.reverseGeocode(lonLat[0], lonLat[1], $('#add-location-form-mobile'));
                }
            },
            () => {
                showNotification('無法取得您的位置，請手動選擇。', 'warning');
                const centerCoords = state.map.getView().getCenter();
                const action = state.isMobile ? enterMobilePlacementMode : enterDesktopAddMode;
                action(centerCoords);
                 if (state.isMobile) $('#add-location-modal-mobile').removeClass('hidden');
            }
        );
    });

    $('#search-address-btn').on('click', () => $('#search-panel').toggleClass('hidden'));
    $('#open-filter-modal').on('click', () => $('#filter-modal').removeClass('hidden'));
    $('#center-on-me-btn').on('click', () => state.userPositionCoords && state.map.getView().animate({ center: state.userPositionCoords, zoom: 16 }));
    $('#open-chat-btn').on('click', () => {
         $('#chat-modal').removeClass('hidden');
         state.unreadChatCount = 0;
         $('#chat-unread-badge').addClass('hidden').text('');
    });

    // --- 表單與 Modals ---
    $('#add-location-form, #add-location-form-mobile').on('submit', handleFormSubmit);
    $('#close-add-location-modal, #close-add-location-modal-mobile, #popup-closer').on('click', (e) => {
        e.preventDefault();
        const id = $(e.target).closest('[id]').attr('id');
        if (id.includes('add-location')) exitAddMode();
        if (id === 'popup-closer') state.infoOverlay.setPosition(undefined);
    });
    $('#filter-btn').on('click', applyFilters);
    $('#reset-btn').on('click', () => { $('#category-select, #keyword-search').val(''); applyFilters(); });
    
    // 行動版新增介面Tabs
    $('.mobile-add-tab').on('click', function() {
        const isArea = $(this).attr('id') === 'mobile-add-area-tab';
        $('.mobile-add-tab').removeClass('active text-indigo-600 bg-indigo-50').addClass('text-gray-500');
        $(this).addClass('active text-indigo-600 bg-indigo-50');
        $('#mobile-point-fields').toggleClass('hidden', isArea);
        $('#mobile-area-fields').toggleClass('hidden', !isArea);
        $('#minimize-mobile-modal-btn').toggleClass('hidden', !isArea);
        if (isArea && state.tempMarker) {
            state.lockedCenterForEditing = state.tempMarker.getPosition();
        } else {
            state.lockedCenterForEditing = null;
        }
        $('#add-is-area').prop('checked', isArea).trigger('change');
    });

    // --- 地圖與列表互動 ---
    state.map.on('singleclick', handleMapClick);
    state.map.on('moveend', updateStoreList);
    $('#store-list-filters').on('click', '.store-filter-btn', function() {
        $('.store-filter-btn').removeClass('active bg-blue-600 text-white').addClass('text-black bg-white');
        $(this).addClass('active bg-blue-600 text-white');
        updateStoreList();
    });

    // --- Popup 內部點擊 ---
    $('#popup').on('click', '.vote-btn', function() { /* ... 投票邏輯 ... */ });
    $('#popup').on('click', '.unit-item', function() { /* ... 顯示單一戶popup ... */ });
}

