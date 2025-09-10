/**
 * @file 集中管理所有對外部 API (Google Apps Script, Google Maps) 的請求。
 */
import { showNotification } from './ui.js';
import { GOOGLE_APPS_SCRIPT_URL, GOOGLE_API_KEY, CHAT_APPS_SCRIPT_URL } from './config.js';

/**
 * 從 Google Sheet 載入主要的地點資料。
 * @param {string|null} city - (可選) 要載入的特定城市。
 * @returns {Promise<Array|null>}
 */
export async function loadData(city = null) {
    let url = `${GOOGLE_APPS_SCRIPT_URL}?action=getData&t=${new Date().getTime()}`;
    if (city) {
        url += `&city=${encodeURIComponent(city)}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    return response.json();
}

/**
 * 根據經緯度反向地理編碼取得地址資訊。
 * @param {number} lon - 經度。
 * @param {number} lat - 緯度。
 * @returns {Promise<Object|null>}
 */
export async function reverseGeocode(lon, lat) {
    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_API_KEY}&language=zh-TW`);
        if (!response.ok) throw new Error('Geocoding API response not OK');
        return await response.json();
    } catch (error) {
        console.error('Reverse geocoding failed:', error);
        showNotification('無法解析地址，請手動輸入。', 'warning');
        return null;
    }
}

/**
 * 根據地址進行地理編碼取得座標資訊。
 * @param {string} address - 要查詢的地址。
 * @returns {Promise<Object|null>}
 */
export async function geocodeAddress(address) {
    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}&region=TW&language=zh-TW`);
        if (!response.ok) throw new Error('Geocoding API response not OK');
        return await response.json();
    } catch (error) {
        console.error('Geocoding failed:', error);
        showNotification('地址解析失敗', 'error');
        return null;
    }
}

/**
 * 根據經緯度反向地理編碼取得城市名稱。
 * @param {number} lon - 經度。
 * @param {number} lat - 緯度。
 * @returns {Promise<string|null>}
 */
export async function reverseGeocodeForCity(lon, lat) {
    try {
        const data = await reverseGeocode(lon, lat);
        if (data?.results?.length > 0) {
            const cityComponent = data.results[0].address_components.find(c => c.types.includes('administrative_area_level_1'));
            if (cityComponent) return cityComponent.long_name;
        }
        return null;
    } catch (error) {
        console.error("Reverse geocoding for city failed:", error);
        return null;
    }
}

/**
 * 呼叫後端 API 驗證 session token。
 * @param {string} token - 要驗證的 token。
 * @returns {Promise<Object>}
 */
export async function verifyTokenAPI(token) {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'verify_token', token: token })
    });
    return response.json();
}

/**
 * 呼叫後端 API 更新使用者暱稱。
 * @param {Object} payload - 包含使用者資訊和新暱稱的物件。
 * @returns {Promise<Object>}
 */
export async function updateNickname(payload) {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'update_nickname', ...payload })
    });
    return response.json();
}


/**
 * 提交新的地點或更新現有地點。
 * @param {Object} payload - 要提交的資料。
 * @returns {Promise<Object>}
 */
export async function submitLocation(payload) {
    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
            showNotification("資料已成功送出！感謝您的貢獻。", 'success');
            return result;
        } else {
            throw new Error(result.message || 'Unknown error');
        }
    } catch (error) {
        showNotification(`送出失敗: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * 提交對地點的評分。
 * @param {string} locationId - 地點的唯一標識 (通常是地址)。
 * @param {'like'|'dislike'} voteType - 評分類型。
 * @param {number} change - 變動值 (1 或 -1)。
 * @param {Array} reports - 該地點的所有報告物件。
 */
export function sendVote(locationId, voteType, change, reports) {
    reports.forEach(report => {
        const payload = {
            action: 'vote',
            rowIndex: report.rowIndex,
            voteType: voteType,
            change: change
        };
        fetch(GOOGLE_APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) })
            .catch(error => console.error('Vote submission failed:', error));
    });
}

/**
 * 使用者刪除自己提交的資料。
 * @param {number} rowIndex - 資料在試算表中的列索引。
 * @param {boolean} isCommunity - 是否為社區/建築資料。
 * @param {Object} userProfile - 當前使用者的個人資料物件。
 * @returns {Promise<Object>}
 */
export async function userDelete(rowIndex, isCommunity, userProfile) {
    const payload = {
        action: isCommunity ? 'user_delete_area' : 'user_delete',
        rowIndex,
        isCommunity,
        userEmail: userProfile.email,
        lineUserId: userProfile.lineUserId
    };
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
    });
    return response.json();
}

/**
 * 管理員執行操作 (通過/駁回/刪除)。
 * @param {string} action - 操作類型。
 * @param {number} rowIndex - 資料列索引。
 * @param {boolean} isCommunity - 是否為社區資料。
 * @param {Object} userProfile - 當前管理員的個人資料物件。
 * @returns {Promise<Object>}
 */
export async function sendAdminAction(action, rowIndex, isCommunity, userProfile) {
    const payload = {
        action: action, // 'approve', 'reject', 'delete'
        rowIndex: rowIndex,
        isCommunity: isCommunity,
        adminEmail: userProfile.email
    };
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
    });
    return response.json();
}

/**
 * 從 Google Sheet 載入聊天歷史紀錄。
 * @returns {Promise<Array>}
 */
export async function getArchivedChatHistory() {
    try {
        const response = await fetch(`${CHAT_APPS_SCRIPT_URL}?action=get_chat_history&t=${new Date().getTime()}`);
        return await response.json();
    } catch (error) {
        console.error("無法載入歷史聊天紀錄:", error);
        showNotification('載入歷史聊天紀錄失敗', 'error');
        return [];
    }
}

/**
 * 呼叫後端 API 禁言使用者。
 * @param {string} targetUserId - 目標使用者的 ID (email 或 lineId)。
 * @param {string} targetUserName - 目標使用者的暱稱。
 * @param {string} duration - 禁言時長 (例如 "1d30m")。
 * @param {Object} userProfile - 當前管理員的個人資料物件。
 * @returns {Promise<Object>}
 */
export async function muteUserAPI(targetUserId, targetUserName, duration, userProfile) {
    const payload = {
        action: 'muteUser',
        adminEmail: userProfile.email,
        targetUserId,
        targetUserName,
        duration,
    };
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
    });
    return response.json();
}

