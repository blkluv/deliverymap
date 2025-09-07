/**
 * @file 處理使用者登入、登出及身份驗證。
 */
import * as api from './api.js';
import { SESSION_TOKEN_KEY } from './config.js';
import { showNotification } from './ui.js';

// --- 模組內部狀態 ---
let isLoggedIn = false;
let userProfile = {};
let isAdmin = false;

// --- Getters ---
export const getLoginStatus = () => isLoggedIn;
export const getUserProfile = () => userProfile;
export const getIsAdmin = () => isAdmin;

/**
 * 處理 Google 登入成功後的回應。
 * @param {Object} googleProfile - 從 Google 取得的使用者個人資料。
 */
async function handleGoogleSignIn(googleProfile) {
    try {
        const response = await fetch(api.GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'google_login', profile: googleProfile })
        });
        const result = await response.json();

        if (result.status === 'success' && result.token) {
            localStorage.setItem(SESSION_TOKEN_KEY, result.token);
            await verifyToken();
        } else {
            showNotification('登入失敗，請稍後再試。', 'error');
        }
    } catch(error) {
        console.error('Google login process failed:', error);
        showNotification('登入時發生錯誤。', 'error');
    }
}

/**
 * 處理登出邏輯。
 */
function handleSignOut() {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (token) {
        fetch(api.GOOGLE_APPS_SCRIPT_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'logout', token: token })
        });
    }

    localStorage.removeItem(SESSION_TOKEN_KEY);
    if (window.google?.accounts?.id) {
        google.accounts.id.disableAutoSelect();
    }
    
    isLoggedIn = false;
    userProfile = {};
    isAdmin = false;

    $('#add-info').removeClass('flex').addClass('hidden');
    $('#review-btn').addClass('hidden');
    $('#user-picture').addClass('hidden').attr('src', '');
    $('#google-signin-container').empty().show();
    initializeGoogleButton();
    showNotification('您已成功登出。');
}

/**
 * 驗證儲存在 localStorage 的 session token。
 * @returns {Promise<boolean>} - 回傳是否成功驗證。
 */
export async function verifyToken() {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) return false;

    try {
        const result = await api.verifyTokenAPI(token); // 修正：呼叫 api.js 中的函式
        if (result.status === 'success' && result.user) {
            setLoginState(result.user);
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
 * 根據使用者個人資料設定登入狀態和 UI。
 * @param {Object} profile - 使用者個人資料。
 */
async function setLoginState(profile) {
    isLoggedIn = true;
    userProfile = profile;
    
    $('#google-signin-container').hide();
    $('#add-info').removeClass('hidden').addClass('flex');
    $('#user-name').text(profile.name || '匿名');
    
    if (profile.pictureUrl) {
        $('#user-picture').attr('src', profile.pictureUrl).removeClass('hidden');
    }

    await checkIfAdmin(profile.email);
    document.dispatchEvent(new CustomEvent('auth-state-changed', { detail: { isLoggedIn: true, profile } }));
}

/**
 * 檢查使用者是否為管理員。
 * @param {string} email - 使用者 Email。
 */
async function checkIfAdmin(email) {
    try {
        const response = await fetch(`${api.GOOGLE_APPS_SCRIPT_URL}?action=checkAdmin&email=${encodeURIComponent(email)}`);
        const result = await response.json();
        isAdmin = result.isAdmin;
        $('#review-btn').toggleClass('hidden', !isAdmin);
    } catch (error) {
        console.error('無法驗證管理員身份:', error);
    }
}

/**
 * 初始化 Google 登入按鈕。
 */
export function initializeGoogleButton() {
    if (window.google?.accounts?.id) {
        google.accounts.id.initialize({
            client_id: '35839698842-b73h9naufqdm7d0j378882k1e6aq6064.apps.googleusercontent.com',
            callback: window.handleCredentialResponse // 確保這是全域函式
        });
        google.accounts.id.renderButton(
            document.getElementById('google-signin-container'),
            { type: 'standard', size: 'large', theme: 'outline', text: 'sign_in_with', shape: 'rectangular', logo_alignment: 'left' } 
        );
        $('#google-signin-container').show();
    } else {
        setTimeout(initializeGoogleButton, 200);
    }
}

/**
 * 處理暱稱修改。
 */
async function handleNicknameEdit() {
    const currentName = $('#user-name').text();
    const newName = prompt("請輸入您的新暱稱：", currentName);

    if (newName && newName.trim() && newName.trim() !== currentName) {
        const trimmedName = newName.trim();
        $('#user-name').text(trimmedName);
        userProfile.name = trimmedName;

        try {
            await api.updateNickname({
                userEmail: userProfile.email,
                lineUserId: userProfile.lineUserId,
                newName: trimmedName
            });
            showNotification('暱稱已更新！', 'success');
            document.dispatchEvent(new CustomEvent('nickname-changed', { detail: { newName: trimmedName } }));
        } catch (error) {
            showNotification(`暱稱更新失敗: ${error.message}`, 'error');
            $('#user-name').text(currentName); // 還原
            userProfile.name = currentName;
        }
    }
}


/**
 * 設置所有與認證相關的事件監聽器。
 */
export function setupAuthListeners() {
    window.addEventListener('google-signin-success', (e) => handleGoogleSignIn(e.detail));
    $('#sign-out-btn').on('click', (e) => {
        e.preventDefault();
        handleSignOut();
    });
    $(document).on('click', '#edit-nickname-btn', handleNicknameEdit);
}

