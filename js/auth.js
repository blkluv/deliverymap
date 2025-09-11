/**
 * @file 處理使用者登入、登出及身份驗證。
 */
import * as api from './api.js';
import { SESSION_TOKEN_KEY, GOOGLE_APPS_SCRIPT_URL } from './config.js';
import { showNotification } from './ui.js';

// --- 模組內部狀態 ---
let isLoggedIn = false;
let userProfile = {};
let isAdmin = false;

// --- Getters ---
export const getLoginStatus = () => isLoggedIn;
export const getUserProfile = () => userProfile;
export const getIsAdmin = () => isAdmin;

// --- LIFF ID ---
const LIFF_ID = '2008020548-lVYKgg0B';

/**
 * 觸發登入流程。
 * 如果使用者未登入，此函式會根據當前環境（LINE 或一般瀏覽器）啟動對應的登入程序。
 */
export async function triggerLogin() {
    const isLineBrowser = navigator.userAgent.toLowerCase().includes("line");
    if (isLineBrowser) {
        // 在 LINE 環境中，呼叫 LIFF 登入，會彈出原生登入視窗
        await initializeLiffLogin();
    } else {
        // 在一般瀏覽器中，提示使用者點擊 Google 登入按鈕
        showNotification('請點擊右上角的按鈕登入', 'info');
        const loginButton = document.getElementById('google-signin-container');
        if (loginButton) {
            // 新增視覺提示效果，引導使用者點擊
            loginButton.style.transition = 'all 0.2s ease-in-out';
            loginButton.style.transform = 'scale(1.05)';
            loginButton.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.7)';
            setTimeout(() => {
                loginButton.style.transform = 'scale(1)';
                loginButton.style.boxShadow = '';
            }, 2500);
        }
    }
}

/**
 * 處理 LINE LIFF 登入流程
 * 當此函式在 LINE App 中被呼叫時，liff.login() 將會觸發原生的滑出式登入畫面。
 */
export async function initializeLiffLogin() {
    try {
        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
            liff.login();
        } else {
            const lineProfile = await liff.getProfile();
            await handleLineSignIn(lineProfile);
        }
    } catch (error) {
        console.error('LIFF 初始化或登入失敗:', error);
        showNotification('LINE 登入失敗，請稍後再試。', 'error');
    }
}

/**
 * 處理 LINE 登入成功後的回應。
 * @param {Object} lineProfile - 從 LIFF 取得的使用者個人資料。
 */
async function handleLineSignIn(lineProfile) {
    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ 
                action: 'line_login', 
                profile: lineProfile,
                last_time: new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" })
            })
        });
        const result = await response.json();

        if (result.status === 'success' && result.token) {
            localStorage.setItem(SESSION_TOKEN_KEY, result.token);
            await verifyToken();
        } else {
            showNotification('登入失敗，請稍後再試。', 'error');
        }
    } catch (error) {
        console.error('LINE login process failed:', error);
        showNotification('登入時發生錯誤。', 'error');
    }
}

/**
 * 處理 Google 登入成功後的回應。
 * @param {Object} googleProfile - 從 Google 取得的使用者個人資料。
 */
async function handleGoogleSignIn(googleProfile) {
    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ 
                action: 'google_login', 
                profile: googleProfile,
                last_time: new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" })
            })
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
        fetch(GOOGLE_APPS_SCRIPT_URL, { 
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
        const result = await api.verifyTokenAPI(token);
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
    if (!email) {
        isAdmin = false;
        $('#review-btn').addClass('hidden');
        return;
    }
    try {
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=checkAdmin&email=${encodeURIComponent(email)}`);
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
            callback: window.handleCredentialResponse
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
            $('#user-name').text(currentName);
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
