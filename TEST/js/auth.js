import { state } from './state.js';
import { APPS_SCRIPT_URL } from './config.js';
import { showNotification } from './ui.js';
import { initializeChat, sendJoinMessage } from './chat.js';
import { loadArchivedChatHistory } from './chat.js'; // 假設聊天紀錄載入也放在 chat 模組

// 設定登入狀態
function setLoginState(profile) {
    state.isLoggedIn = true;
    state.userProfile = profile;
    state.currentUserDisplayName = profile.name;
    // ... 更新 UI ...
    // ... 檢查管理員權限 ...
    if (state.isLocationKnown) {
        sendJoinMessage();
    }
}

// 驗證 token
async function verifyToken() {
    // ... 驗證 token 邏輯 ...
}

// Google 登入回呼函式
function handleGoogleCredentialResponse(response) {
    // ... 解碼 JWT 並發送至後端 ...
}

// 初始化 Google 登入按鈕
function initializeGoogleButton() {
    // ... google.accounts.id.initialize & renderButton ...
}

// 初始化驗證流程
export async function initializeAuth() {
    window.handleCredentialResponse = handleGoogleCredentialResponse; // 讓全域可以呼叫
    const isLoggedIn = await verifyToken();
    if (!isLoggedIn) {
        initializeGoogleButton();
    }
}
