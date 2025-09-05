import { state } from './state.js';
import * as api from './api.js';

// 顯示通知訊息
export function showNotification(message, type = 'info') {
    const $notification = $('#notification');
    $notification.text(message).removeClass('hidden');
    $notification.removeClass('bg-blue-500 bg-green-500 bg-red-500 bg-yellow-500');
    switch(type) {
        case 'error': $notification.addClass('bg-red-500'); break;
        case 'success': $notification.addClass('bg-green-500'); break;
        case 'warning': $notification.addClass('bg-yellow-500'); break;
        default: $notification.addClass('bg-blue-500');
    }
    setTimeout(() => $notification.addClass('hidden'), 5000);
}

// 初始化所有 UI 事件監聽器
export function initializeUI(map) {
    // 篩選器 modal
    $('#open-filter-modal').on('click', () => $('#filter-modal').removeClass('hidden'));
    $('#close-filter-modal').on('click', () => $('#filter-modal').addClass('hidden'));
    $('#filter-btn').on('click', () => {
        // ... applyFilters 邏輯 ...
        $('#filter-modal').addClass('hidden');
    });
    $('#reset-btn').on('click', () => {
        // ... resetFilters 邏輯 ...
    });

    // 搜尋面板
    $('#search-address-btn').on('click', () => $('#search-panel').toggleClass('hidden'));
    $('#close-search-panel').on('click', () => $('#search-panel').addClass('hidden'));
    $('#search-address-input').on('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            api.performSearch($(this).val());
        }
    });

    // 地圖控制按鈕
    $('#center-on-me-btn').on('click', () => {
        if (state.userPositionCoords) {
            map.getView().animate({ center: state.userPositionCoords, zoom: 16, duration: 800 });
        } else {
            showNotification('無法定位您的位置。', 'warning');
        }
    });

    // 新增地點流程
    $('#add-location-btn').on('click', () => {
        // ... add location 邏輯 ...
    });

    // 關閉各種 Modal
    $('#close-add-location-modal, #close-add-location-modal-mobile').on('click', () => {
        // ... exitAddMode 邏輯 ...
    });

    // ... 其他 UI 元素的事件綁定 ...
}
