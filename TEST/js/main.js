// 引入所有模組的初始化函式
import { initializeMap } from './map.js';
import { initializeUI } from './ui.js';
import { initializeAuth } from './auth.js';
import { initializeChat } from './chat.js';
import { initializeGrid } from './grid.js';
import { initializeUserLocation } from './api.js';

// 主應用程式邏輯
function main() {
    // 偵測是否在 LINE App 中，以調整 UI
    const isLineApp = navigator.userAgent.toLowerCase().indexOf("line") > -1;
    if (isLineApp) {
        document.documentElement.style.setProperty('--mobile-bottom-offset', '4rem');
    }

    // 初始化所有模組
    const map = initializeMap();
    initializeUI(map);
    initializeAuth();
    initializeChat();
    initializeGrid(map);
    
    // 開始定位使用者並載入地圖資料
    initializeUserLocation(map);
}

// 當 DOM 載入完成後執行主程式
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
