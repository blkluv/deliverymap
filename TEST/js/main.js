// 引入所有模組的初始化函式
import { initializeMap } from './map.js';
import { initializeUI } from './ui.js';
import { initializeAuth } from './auth.js';
import { initializeChat } from './chat.js';
import { initializeGrid } from './grid.js';
import { initializeUserLocation } from './api.js';

// 主應用程式邏輯
async function main() {
    // 偵測是否在 LINE App 中，以調整 UI
    const isLineApp = navigator.userAgent.toLowerCase().indexOf("line") > -1;
    if (isLineApp) {
        document.documentElement.style.setProperty('--mobile-bottom-offset', '4rem');
    }

    // 初始化 Google Sign-In 的全域回呼函式
    // 這必須在 auth.js 載入前完成
    window.handleCredentialResponse = (response) => {
        const event = new CustomEvent('google-signin-success', { detail: response });
        window.dispatchEvent(event);
    };

    // 依序初始化各模組
    initializeMap();
    initializeUI();
    initializeGrid();
    await initializeAuth(); // 等待驗證完成
    initializeChat();
    
    // 最後，開始定位使用者並載入地圖資料
    initializeUserLocation();
}

// 當 DOM 載入完成後執行主程式
document.addEventListener('DOMContentLoaded', main);

