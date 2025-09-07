/**
 * @file 處理使用者登入、登出及身份驗證。
 */
import { SESSION_TOKEN_KEY } from './config.js';
import * as api from './api.js';
import { showNotification } from './ui.js';
import { sendJoinMessage, setCurrentUserDisplayName } from './chat.js';

// --- 模組內部狀態 ---
let isLoggedIn = false;
let userProfile = {};
let isAdmin = false;

export const getLoginStatus = () => isLoggedIn;
export const getUserProfile = () => userProfile;
export const getIsAdmin = () => isAdmin;

/**
 * 根據 Profile 設定登入狀態並更新 UI。
 * @param {Object} profile - 使用者個人資料。
 */
async function setLoginState(profile) {
    isLoggedIn = true;
    userProfile = profile;
    
    // 從後端資料庫取得或使用 profile 的預設名稱
    const displayName = profile.name || '匿名';
    setCurrentUserDisplayName(displayName);

    $('#google-signin-container').hide();
    $('#add-info').removeClass('hidden').addClass('flex');
    $('#user-name').text(displayName);
    
    if (profile.pictureUrl) {
        $('#user-picture').attr('src', profile.pictureUrl).removeClass('hidden');
    } else {
        $('#user-picture').addClass('hidden').attr('src', '');
    }

    // 檢查管理員權限
    isAdmin = await api.checkIfAdmin(userProfile.email);
    $('#review-btn').toggleClass('hidden', !isAdmin);

    // 通知聊天模組使用者已登入
    sendJoinMessage();
}

/**
 * 初始化 Google 登入按鈕。
 */
export function initializeGoogleButton() {
    const container = document.getElementById('google-signin-container');
    if (!container || typeof google === 'undefined') {
        setTimeout(initializeGoogleButton, 200); // 如果 GSI 還沒載入，稍後重試
        return;
    }
    
    google.accounts.id.initialize({
        client_id: '35839698842-b73h9naufqdm7d0j378882k1e6aq6064.apps.googleusercontent.com',
        callback: handleGoogleSignIn, // 這個函式會處理從 index.html 傳來的事件
    });
    google.accounts.id.renderButton(container, { 
        type: 'standard', size: 'large', theme: 'outline',
        text: 'sign_in_with', shape: 'rectangular', logo_alignment: 'left'
    });
    $(container).show();
}

/**
 * 處理來自 Google 的登入憑證回應。
 * @param {Object} googleProfile - 從 JWT 解碼後的 Google 使用者 Profile。
 */
async function handleGoogleSignIn(googleProfile) {
    try {
        const result = await api.googleLogin(googleProfile);
        if (result.status === 'success' && result.token) {
            localStorage.setItem(SESSION_TOKEN_KEY, result.token);
            await verifyToken(); // 使用新 token 驗證並設定登入狀態
        } else {
            throw new Error(result.message || 'Login failed');
        }
    } catch(error) {
        console.error('Google login process failed:', error);
        showNotification('登入時發生錯誤。', 'error');
    }
}

/**
 * 驗證儲存在 localStorage 的 session token。
 * @returns {Promise<boolean>} 是否成功驗證。
 */
export async function verifyToken() {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) return false;

    try {
        const result = await api.verifyToken(token);
        if (result.status === 'success' && result.user) {
            await setLoginState(result.user);
            return true;
        } else {
            localStorage.removeItem(SESSION_TOKEN_KEY);
            return false;
        }
    } catch(error) {
        console.error('Token 驗證失敗:', error);
        localStorage.removeItem(SESSION_TOKEN_KEY);
        return false;
    }
}

/**
 * 處理使用者登出。
 */
function handleSignOut() {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (token) {
        api.logout(token);
        localStorage.removeItem(SESSION_TOKEN_KEY);
    }

    if (window.google) {
        google.accounts.id.disableAutoSelect();
    }
    
    // 重設狀態
    isLoggedIn = false;
    userProfile = {};
    isAdmin = false;

    // 更新 UI
    $('#add-info').addClass('hidden').removeClass('flex');
    $('#review-btn').addClass('hidden');
    $('#google-signin-container').empty();
    initializeGoogleButton();

    showNotification('您已成功登出。');
}

/**
 * 處理暱稱修改。
 */
async function handleNicknameEdit() {
    const currentName = $('#user-name').text();
    const newName = prompt("請輸入您的新暱稱：", currentName);

    if (!newName || newName.trim() === '' || newName.trim() === currentName) {
        if (newName === '') showNotification('暱稱不能為空。', 'error');
        return;
    }
    
    const trimmedName = newName.trim();
    $('#user-name').text(trimmedName); // 先更新 UI
    
    try {
        const result = await api.updateNickname(trimmedName);
        if (result.status !== 'success') throw new Error(result.message);
        
        showNotification('暱稱已更新！', 'success');
        setCurrentUserDisplayName(trimmedName); // 同步到聊天模組
        sendJoinMessage(); // 發送名稱變更訊息
    } catch (error) {
        showNotification(`暱稱更新失敗: ${error.message}`, 'error');
        $('#user-name').text(currentName); // 如果失敗，還原 UI
    }
}


/**
 * 初始化所有認證相關的事件監聽器。
 */
export function setupAuthListeners() {
    // 監聽來自 index.html 的全域事件
    window.addEventListener('google-signin-success', (e) => handleGoogleSignIn(e.detail));
    
    $('#sign-out-btn').on('click', (e) => {
        e.preventDefault();
        handleSignOut();
    });
    
    $('#edit-nickname-btn').on('click', handleNicknameEdit);
}

