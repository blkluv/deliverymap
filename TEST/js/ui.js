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
    const extent = state.map.getView().calculateExtent(state.map.getSize());
    const $listContent = $('#store-list-content');
    const activeCategory = $('#store-list-filters .active').data('category');
    $listContent.html('');
    
    const uniqueFeatures = new Map();
    if (state.clusterSource) {
        state.clusterSource.forEachFeatureInExtent(extent, cluster => {
            cluster.get('features').forEach(feature => {
                if (!uniqueFeatures.has(feature.getId())) {
                    uniqueFeatures.set(feature.getId(), feature);
                }
            });
        });
    }

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
 * 初始化所有 UI 事件監聽器
 */
export function initializeUI() {
    // Facebook 瀏覽器偵測
    (function() {
        const ua = navigator.userAgent.toLowerCase();
        const isFacebookApp = ua.indexOf("fban") > -1 || ua.indexOf("fbav") > -1;
        if (isFacebookApp) {
            $('#facebook-blocker-modal').css('display', 'flex');
        }
    })();

    // 清理 URL 參數
    (function() {
        const url = new URL(window.location);
        if (url.searchParams.has('fbclid')) {
            window.history.replaceState({}, document.title, url.pathname + url.hash);
        }
    })();
    
    // 主按鈕事件
    $('#search-address-btn').on('click', async () => {
         $('#search-panel').toggleClass('hidden');
         if (!$('#search-panel').hasClass('hidden')) {
             $('#search-address-input').val('').focus();
             try {
                if (navigator.clipboard && await navigator.permissions.query({ name: 'clipboard-read' })) {
                    const text = await navigator.clipboard.readText();
                    if (['區', '路', '街', '巷', '弄', '號'].some(k => text.includes(k))) {
                        $('#search-address-input').val(text);
                    }
                }
             } catch(e) { console.warn("無法讀取剪貼簿", e); }
         }
    });
    $('#open-filter-modal').on('click', () => $('#filter-modal').removeClass('hidden'));
    $('#center-on-me-btn').on('click', () => {
        if (state.userPositionCoords) state.map.getView().animate({ center: state.userPositionCoords, zoom: 16, duration: 800 });
        else showNotification('無法定位您的位置。', 'warning');
    });
    $('#open-chat-btn').on('click', () => {
        $('#chat-modal').removeClass('hidden');
        state.unreadChatCount = 0;
        $('#chat-unread-badge').addClass('hidden').text('');
        setTimeout(() => $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight), 0);
    });

    // 搜尋面板
    $('#close-search-panel').on('click', () => $('#search-panel').addClass('hidden'));
    $('#search-address-input').on('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // This function would be in api.js, let's assume it exists and handles the search
            // api.performSearch($(e.target).val());
             $('#search-panel').addClass('hidden');
        }
    });

    // 篩選 Modal
    $('#close-filter-modal').on('click', () => $('#filter-modal').addClass('hidden'));
    $('#filter-btn').on('click', applyFilters);
    $('#reset-btn').on('click', () => {
        $('#category-select, #keyword-search').val('');
        applyFilters();
    });
    
    // 登入/狀態 UI
    $('#edit-nickname-btn').on('click', () => {
        const newName = prompt("請輸入您的新暱稱：", state.currentUserDisplayName);
        if (newName && newName.trim() && newName.trim() !== state.currentUserDisplayName) {
            auth.updateNickname(newName.trim());
        }
    });
    $('#sign-out-btn').on('click', e => { e.preventDefault(); auth.signOut(); });
    $('#manage-btn').on('click', () => { /* Logic for management modal */ });
    $('#review-btn').on('click', () => { /* Logic for review modal */ });
    
    // 聊天室 UI
    $('#close-chat-modal').on('click', () => $('#chat-modal').addClass('hidden'));
    $('#send-chat-btn').on('click', () => { /* Implemented in chat.js */ });
    $('#chat-input').on('keydown', e => { if (e.key === 'Enter') e.preventDefault(); /* Implemented in chat.js */ });
    $('#hide-system-msgs-checkbox').on('change', function() { $('#chat-messages').toggleClass('hide-system-messages', $(this).is(':checked')); });

    // 地圖互動
    state.map.on('singleclick', handleMapClick);
    state.map.on('moveend', updateStoreList);
    
    // 列表篩選
     $('#store-list-filters').on('click', '.store-filter-btn', function() {
        const $btn = $(this);
        $('.store-filter-btn').removeClass('active bg-blue-600 text-white').addClass('bg-white text-black');
        $btn.addClass('active bg-blue-600 text-white').removeClass('bg-white text-black');
        updateStoreList();
    });
}


/**
 * 處理地圖點擊事件
 * @param {ol.MapBrowserEvent} evt - 地圖事件
 */
function handleMapClick(evt) {
    if (state.isAreaSelectionMode) return;
    
    let featureClicked = false;
    state.map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
        if (featureClicked) return; // Process only the top-most feature
        
        const clusterFeatures = feature.get('features');
        if (clusterFeatures) { // It's a cluster
            featureClicked = true;
            if (clusterFeatures.length > 1) {
                const extent = ol.extent.createEmpty();
                clusterFeatures.forEach(f => ol.extent.extend(extent, f.getGeometry().getExtent()));
                state.map.getView().fit(extent, { duration: 500, padding: [80, 80, 80, 80] });
            } else {
                displayPopupForFeature(clusterFeatures[0]);
            }
        }
    });

    if (!featureClicked) {
        state.infoOverlay.setPosition(undefined);
    }
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

