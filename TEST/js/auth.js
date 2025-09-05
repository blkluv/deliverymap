import { state } from './state.js';
import { APPS_SCRIPT_URL, GOOGLE_CLIENT_ID, LIFF_ID, SESSION_TOKEN_KEY, VOTES_STORAGE_KEY } from './config.js';
import { showNotification } from './ui.js';
import { loadArchivedChatHistory, sendJoinMessage } from './chat.js';

function loadUserVotes() {
    try {
        const storedVotes = localStorage.getItem(VOTES_STORAGE_KEY);
        state.userVotes = storedVotes ? JSON.parse(storedVotes) : {};
    } catch (e) {
        console.error("無法載入使用者評分:", e);
        state.userVotes = {};
    }
}

export function saveUserVotes() {
    try {
        localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(state.userVotes));
    } catch (e) {
        console.error("無法儲存使用者評分:", e);
    }
}

async function checkIfAdmin(email) {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=checkAdmin&email=${encodeURIComponent(email)}`);
        if (!response.ok) throw new Error('Admin check failed');
        const result = await response.json();
        state.isAdmin = result.isAdmin;
        $('#review-btn').toggleClass('hidden', !state.isAdmin);
    } catch (error) {
        showNotification('無法驗證管理員身份', 'error');
    }
}

async function setLoginState(profile) {
    state.isLoggedIn = true;
    state.userProfile = profile;
    state.currentUserDisplayName = profile.name;

    $('#google-signin-container').hide();
    $('#add-info').removeClass('hidden').addClass('flex');
    $('#user-name').text(state.currentUserDisplayName);
    
    const $userPicture = $('#user-picture');
    if (profile.pictureUrl) {
        $userPicture.attr('src', profile.pictureUrl).removeClass('hidden');
    } else {
        $userPicture.addClass('hidden').attr('src', '');
    }

    await checkIfAdmin(state.userProfile.email);
    
    if (!state.isChatHistoryLoaded) {
        await loadArchivedChatHistory();
        state.isChatHistoryLoaded = true;
    }
    
    if (state.isLocationKnown) {
        sendJoinMessage();
    }
}

async function verifyToken() {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) return false;

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'verify_token', token: token })
        });
        const result = await response.json();
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

function initializeGoogleButton() {
    const isLineApp = navigator.userAgent.toLowerCase().indexOf("line") > -1;
    if (isLineApp) return;

    try {
        if (window.google && window.google.accounts && window.google.accounts.id) {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: window.handleCredentialResponse
            });
            google.accounts.id.renderButton(
                document.getElementById('google-signin-container'),
                { theme: 'outline', size: 'large', type: 'standard', shape: 'rectangular' }
            );
            $('#google-signin-container').show();
        } else {
            console.warn("Google Identity Services library not loaded yet.");
        }
    } catch(e) {
        console.error("Google Sign-In button initialization failed:", e);
    }
}

export async function initializeAuth() {
    const isLineApp = navigator.userAgent.toLowerCase().indexOf("line") > -1;
    
    loadUserVotes();
    
    window.addEventListener('google-signin-success', async (e) => {
        const credentialResponse = e.detail;
        const base64Url = credentialResponse.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        const googleProfile = JSON.parse(jsonPayload);

        try {
            const response = await fetch(APPS_SCRIPT_URL, {
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
    });
    
    const isTokenLoggedIn = await verifyToken();

    if (isLineApp && !isTokenLoggedIn) {
        window.location.href = `https://liff.line.me/${LIFF_ID}`;
        return;
    }
    
    if (!isTokenLoggedIn) {
        initializeGoogleButton();
    }

    // Event listener for when location is known, to send join message
    window.addEventListener('location-known', () => {
        if (state.isLoggedIn) {
            sendJoinMessage();
        }
    });
}
