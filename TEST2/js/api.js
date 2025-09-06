/**
 * @file 集中管理所有對外部 API 的請求。
 */
import { APPS_SCRIPT_URL, CHAT_APPS_SCRIPT_URL, GOOGLE_MAPS_API_KEY } from './config.js';
import { getUserProfile } from './auth.js';

/**
 * 通用的 POST 請求函式。
 * @param {string} url - API 端點 URL。
 * @param {Object} payload - 要傳送的資料。
 * @param {boolean} noCors - 是否使用 no-cors 模式 (用於某些 Google Apps Script 部署)。
 * @returns {Promise<Object>} - API 的 JSON 回應。
 */
async function postRequest(url, payload, noCors = false) {
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // Apps Script 建議使用 text/plain
        body: JSON.stringify(payload),
    };
    if (noCors) {
        options.mode = 'no-cors';
    }
    
    const response = await fetch(url, options);
    if (noCors) return {}; // no-cors 模式下無法讀取回應
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown server error' }));
        throw new Error(errorData.message || `Network response was not ok: ${response.statusText}`);
    }
    return response.json();
}

/**
 * 從 Google Sheet 載入地點資料。
 * @param {string|null} city - (可選) 要篩選的城市。
 * @returns {Promise<Array>} - 地點資料陣列。
 */
export async function loadData(city = null) {
    let url = `${APPS_SCRIPT_URL}?action=getData&t=${new Date().getTime()}`;
    if (city) {
        url += `&city=${encodeURIComponent(city)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
    return response.json();
}

/**
 * 使用 Google Geocoding API 將地址轉換為座標。
 * @param {string} address - 要查詢的地址。
 * @returns {Promise<Object|null>} - Geocoding 結果。
 */
export async function geocodeAddress(address) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}&region=TW&language=zh-TW`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Geocoding API response not OK');
        return await response.json();
    } catch (error) {
        console.error('Geocoding failed:', error);
        return null;
    }
}

/**
 * 使用 Google Geocoding API 將座標轉換為地址。
 * @param {number} lon - 經度。
 * @param {number} lat - 緯度。
 * @returns {Promise<string>} - 格式化的地址。
 */
export async function getAddressFromCoords(lon, lat) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
    try {
        const response = await fetch(url);
        if (!response.ok) return '無法取得地址';
        const data = await response.json();
        return data.results?.[0]?.formatted_address || '無法解析地址';
    } catch (error) {
        console.error("Reverse geocoding failed:", error);
        return '地址解析失敗';
    }
}

/**
 * 反向地理編碼以取得城市名稱。
 * @param {number} lon - 經度。
 * @param {number} lat - 緯度。
 * @returns {Promise<string|null>} - 城市名稱。
 */
export async function reverseGeocodeForCity(lon, lat) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW&result_type=administrative_area_level_1`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Geocoding API response not OK');
        const data = await response.json();
        const cityComponent = data.results?.[0]?.address_components.find(c => c.types.includes('administrative_area_level_1'));
        return cityComponent?.long_name || null;
    } catch (error) {
        console.error("Reverse geocoding for city failed:", error);
        return null;
    }
}

/**
 * 提交新的地點/建築資料。
 * @param {Object} data - 表單資料。
 * @returns {Promise<Object>} - API 回應。
 */
export function submitLocation(data) {
    return postRequest(APPS_SCRIPT_URL, data);
}

/**
 * 送出評分。
 * @param {Array} reports - 屬於該地點的所有報告物件。
 * @param {'like'|'dislike'} voteType - 評分類型。
 * @param {number} change - 變化量 (+1 or -1)。
 */
export function sendVote(reports, voteType, change) {
    reports.forEach(report => {
        const payload = {
            action: 'vote',
            rowIndex: report.rowIndex,
            voteType: voteType,
            change: change
        };
        // 評分操作通常不需要等待回應，使用 no-cors 快速發送
        postRequest(APPS_SCRIPT_URL, payload, true).catch(e => console.error('Vote submission failed:', e));
    });
}

/**
 * 刪除使用者自己的貢獻。
 * @param {number} rowIndex - 試算表中的行索引。
 * @param {boolean} isCommunity - 是否為社區/建築項目。
 * @returns {Promise<Object>}
 */
export function userDelete(rowIndex, isCommunity) {
    const profile = getUserProfile();
    const payload = {
        action: 'user_delete',
        rowIndex,
        isCommunity,
        userEmail: profile.email,
        lineUserId: profile.lineUserId
    };
    // 刪除操作需要確認，使用 no-cors
    return postRequest(APPS_SCRIPT_URL, payload, true);
}


/**
 * 管理員執行操作（通過、駁回、刪除）。
 * @param {'approve'|'reject'|'delete'} action - 執行的操作。
 * @param {number} rowIndex - 試算表中的行索引。
 * @param {boolean} isCommunity - 是否為社區/建築項目。
 * @returns {Promise<Object>}
 */
export function sendAdminAction(action, rowIndex, isCommunity) {
    const profile = getUserProfile();
    const payload = {
        action, // 'approve', 'reject', or 'delete'
        rowIndex,
        isCommunity,
        adminEmail: profile.email
    };
    return postRequest(APPS_SCRIPT_URL, payload);
}

/**
 * 取得歷史聊天紀錄。
 * @returns {Promise<Array>}
 */
export async function getArchivedChatHistory() {
    const response = await fetch(`${CHAT_APPS_SCRIPT_URL}?action=get_chat_history&t=${new Date().getTime()}`);
    if (!response.ok) throw new Error('Could not fetch chat history');
    return response.json();
}

/**
 * (管理員) 禁言使用者。
 * @param {string} targetUserId - 目標使用者的 ID。
 * @param {string} targetUserName - 目標使用者的暱稱。
 * @param {string} duration - 禁言時長 (例如 '1d30m')。
 * @returns {Promise<Object>}
 */
export function muteUserAPI(targetUserId, targetUserName, duration) {
    const profile = getUserProfile();
    const payload = {
        action: 'muteUser',
        adminEmail: profile.email,
        targetUserId,
        targetUserName,
        duration,
    };
    return postRequest(APPS_SCRIPT_URL, payload);
}

/**
 * 更新使用者暱稱。
 * @param {string} newName - 新的暱稱。
 * @returns {Promise<Object>}
 */
export function updateNickname(newName) {
    const profile = getUserProfile();
    const payload = {
        action: 'update_nickname',
        userEmail: profile.email,
        lineUserId: profile.lineUserId,
        newName: newName
    };
    return postRequest(APPS_SCRIPT_URL, payload);
}

/**
 * 檢查使用者是否為管理員。
 * @param {string} email - 使用者 Email。
 * @returns {Promise<boolean>}
 */
export async function checkIfAdmin(email) {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=checkAdmin&email=${encodeURIComponent(email)}`);
        if (!response.ok) return false;
        const result = await response.json();
        return result.isAdmin || false;
    } catch (error) {
        console.error("Admin check failed:", error);
        return false;
    }
}

/**
 * 使用 Google Profile 登入並取得後端 token。
 * @param {Object} profile - Google User Profile。
 * @returns {Promise<Object>}
 */
export function googleLogin(profile) {
    return postRequest(APPS_SCRIPT_URL, { action: 'google_login', profile });
}

/**
 * 驗證後端 session token。
 * @param {string} token - Session Token。
 * @returns {Promise<Object>}
 */
export function verifyToken(token) {
    return postRequest(APPS_SCRIPT_URL, { action: 'verify_token', token });
}

/**
 * 登出。
 * @param {string} token - Session Token。
 */
export function logout(token) {
    postRequest(APPS_SCRIPT_URL, { action: 'logout', token }).catch(e => console.error("Logout failed", e));
}

