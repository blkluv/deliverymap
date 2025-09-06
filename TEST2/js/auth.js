/**
 * @file 處理使用者登入、登出、身份驗證和個人資料管理。
 */
import { GOOGLE_CLIENT_ID, SESSION_TOKEN_KEY } from './config.js';
import { googleLoginAPI, verifyTokenAPI, updateNicknameAPI, logoutAPI, checkIfAdmin } from './api.js';
import { showNotification } from './ui.js';
import { sendJoinMessage, sendNicknameChange } from './chat.js';

// --- 模組內狀態變數 ---
let userProfile = {};
let isLoggedIn = false;
let isAdmin = false;
let currentUserDisplayName = '';
let isLocationKnown = false;

// --- Getters & Setters ---
export const getLoginStatus = () => isLoggedIn;
export const getUserProfile = () => userProfile;
export const getIsAdmin = () => isAdmin;
export const getCurrentUserDisplayName = () => currentUserDisplayName;
export const setLocationStatus = (known) => { isLocationKnown = known; };


/**
 * 初始化 Google 登入按鈕。
 */
export function initializeGoogleButton() {
    const isLineApp = navigator.userAgent.toLowerCase().includes("line");
    if (isLineApp) return; // LINE 環境不顯示 Google 登入

    const setup = () => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
            const $container = $('#google-signin-container');
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleCredentialResponse
            });
            google.accounts.id.renderButton($container[0], {
                type: 'standard',
                size: 'large',
                theme: 'outline',
                text: 'sign_in_with',
                shape: 'rectangular',
                logo_alignment: 'left'
            });
            $container.show();
        } else {
            setTimeout(setup, 200); // 如果 GSI 還沒載入，稍後重試
        }
    };
    setup();
}

/**
 * Google 登入後的回呼函式。
 * @param {Object} response - Google 的憑證回應。
 */
async function handleCredentialResponse(response) {
    // 解碼 JWT 以取得使用者個人資料
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const googleProfile = JSON.parse(jsonPayload);
    
    try {
        const result = await googleLoginAPI(googleProfile);
        if (result.status === 'success' && result.token) {
            localStorage.setItem(SESSION_TOKEN_KEY, result.token);
            await verifyToken(); // 驗證 token 並設定登入狀態
        } else {
            throw new Error(result.message || '無法取得 Session Token');
        }
    } catch (error) {
        console.error('Google 登入流程失敗:', error);
        showNotification('登入時發生錯誤。', 'error');
    }
}

/**
 * 驗證儲存在 localStorage 中的 token。
 * @returns {Promise<boolean>} Token 是否有效。
 */
export async function verifyToken() {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
        return false;
    }

    try {
        const result = await verifyTokenAPI(token);
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
 * 設定使用者的登入狀態並更新 UI。
 * @param {Object} profile - 使用者個人資料。
 */
export async function setLoginState(profile) {
    isLoggedIn = true;
    userProfile = profile;
    currentUserDisplayName = profile.name || '匿名使用者';

    $('#google-signin-container').hide();
    $('#add-info').removeClass('hidden').addClass('flex');
    $('#user-name').text(currentUserDisplayName);
    
    const $userPicture = $('#user-picture');
    if (profile.pictureUrl) {
        $userPicture.attr('src', profile.pictureUrl).removeClass('hidden');
    } else {
        $userPicture.addClass('hidden');
    }

    isAdmin = await checkIfAdmin(userProfile.email);
    $('#review-btn').toggleClass('hidden', !isAdmin);

    if (isLocationKnown) {
        sendJoinMessage();
    }
}

/**
 * 處理登出。
 */
export function signOut() {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (token) {
        logoutAPI(token).catch(err => console.error("登出 API 呼叫失敗:", err));
        localStorage.removeItem(SESSION_TOKEN_KEY);
    }

    if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
    
    // 重設狀態
    isLoggedIn = false;
    userProfile = {};
    isAdmin = false;
    currentUserDisplayName = '';

    // 更新 UI
    $('#add-info').removeClass('flex').addClass('hidden');
    $('#review-btn').addClass('hidden');
    $('#user-picture').addClass('hidden').attr('src', '');
    $('#google-signin-container').empty(); 
    
    initializeGoogleButton();
    showNotification('您已成功登出。');
}

/**
 * 處理暱稱修改。
 */
async function handleNicknameEdit() {
    const currentName = currentUserDisplayName;
    const newName = prompt("請輸入您的新暱稱：", currentName);

    if (!newName || newName.trim() === '' || newName.trim() === currentName) {
        if (newName === '') showNotification('暱稱不能為空。', 'error');
        return;
    }

    const trimmedNewName = newName.trim();
    currentUserDisplayName = trimmedNewName;
    $('#user-name').text(trimmedNewName);

    // 即時更新聊天室中的暱稱
    sendNicknameChange(trimmedNewName);

    try {
        const result = await updateNicknameAPI({
            userEmail: userProfile.email,
            lineUserId: userProfile.lineUserId,
            newName: trimmedNewName
        });

        if (result.status === 'success') {
           showNotification('暱稱已同步更新！', 'success');
        } else {
           throw new Error(result.message || 'Unknown error');
        }
    } catch (error) {
        console.error('暱稱同步失敗:', error);
        showNotification(`暱稱同步失敗: ${error.message}`, 'error');
        // 如果失敗，還原 UI 和狀態
        currentUserDisplayName = currentName;
        $('#user-name').text(currentName);
    }
}

/**
 * 設定認證相關的事件監聽器。
 */
export function setupAuthEventListeners() {
    $('#sign-out-btn').on('click', (e) => {
        e.preventDefault();
        signOut();
    });
    
    // 使用事件代理以確保 DOM 元素存在
    $(document).on('click', '#edit-nickname-btn', handleNicknameEdit);
}

// 將 handleCredentialResponse 附加到 window，因為 Google API 需要全域存取
window.handleCredentialResponse = handleCredentialResponse;

