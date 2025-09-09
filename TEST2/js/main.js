/**
 * @file 應用程式的主要進入點，負責初始化和協調所有模組。
 */
import * as config from './config.js';
import * as mapModule from './map.js';
import * as uiModule from './ui.js';
import * as api from './api.js';
import * as authModule from './auth.js';
import * as addLocationModule from './add-location.js';
import * as gridModule from './grid.js';
import * as chatModule from './chat.js';
import * as managementModule from './management.js';

// --- 全域狀態變數 ---
let allFeatures = [];
let rawReports = [];

/**
 * 載入並處理應用程式所需的主要資料。
 * @param {string|null} city - (可選) 要載入的特定城市。
 */
async function loadAndProcessData(city = null) {
    uiModule.showNotification('正在讀取資料...');
    try {
        if (typeof pinyinPro === 'undefined' || typeof Fuse === 'undefined') {
            throw new Error('相依性函式庫 (pinyin-pro or Fuse.js) 載入失敗。');
        }

        rawReports = await api.loadData(city);
        if (!rawReports) {
            throw new Error('從伺服器取得的資料為空，這通常是 CORS 錯誤造成的。');
        }

        managementModule.setRawReports(rawReports);
        processRawData(rawReports);

        uiModule.populateFiltersAndLegend();
        uiModule.updateStoreList();
        uiModule.hideNotification();
    } catch (error) {
        console.error("資料載入與處理失敗:", error);
        let errorMessage = '無法載入資料！請稍後再試。';
        if (error.message.includes('fetch') || error.message.includes('CORS')) {
            errorMessage = '無法載入資料：發生網路或 CORS 錯誤，請檢查您的後端 Apps Script 部署設定。';
        } else if (error.message.includes('相依性函式庫') || error.message.includes('資料為空')) {
            errorMessage = `錯誤：${error.message}`;
        }
        uiModule.showNotification(errorMessage, 'error');
    }
}


/**
 * 處理從 API 獲取的原始資料，轉換為地圖 features。
 * @param {Array} results - 原始報告資料。
 */
function processRawData(results) {
    const { pinyin } = pinyinPro;
    const groupedData = new Map();
    const communityAreas = [];

    results.forEach(data => {
        if (data.isCommunity) communityAreas.push(data);
        const baseAddress = (data['地址'] || '').split(/樓|之|-/)[0].trim();
        if (baseAddress) {
            if (!groupedData.has(baseAddress)) groupedData.set(baseAddress, []);
            groupedData.get(baseAddress).push(data);
        }
    });

    mapModule.vectorSource.clear();
    mapModule.areaGridSource.clear();
    allFeatures = [];
    
    mapModule.drawCommunityAreas(communityAreas);

    groupedData.forEach((group, baseAddress) => {
        if(group.every(item => item.isCommunity)) return;
        
        const first = group[0];
        const lon = parseFloat(first['經度']), lat = parseFloat(first['緯度']);
        if (isNaN(lon) || isNaN(lat)) return;

        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            name: baseAddress,
            category: first['分類'] || '其他',
            address: baseAddress,
            likes: group.reduce((sum, r) => sum + (parseInt(r.likes) || 0), 0),
            dislikes: group.reduce((sum, r) => sum + (parseInt(r.dislikes) || 0), 0),
            approved: group.some(r => String(r['審核']).toUpperCase() === 'TRUE'),
            reports: group,
            address_pinyin: pinyin(baseAddress || '', { pattern: 'pinyin', toneType: 'none' }),
        });
        feature.setId(baseAddress);
        
        if (feature.get('approved')) {
            allFeatures.push(feature);
            mapModule.vectorSource.addFeature(feature);
        }
    });
    
    const fuse = new Fuse(allFeatures, {
        includeScore: true, threshold: 0.1, minMatchCharLength: 2,
        ignoreLocation: true, keys: ['values_.address_pinyin', 'values_.reports.blacklistReason']
    });
    uiModule.setSearchableData(fuse, allFeatures);
}


/**
 * 初始化使用者地理位置。
 */
async function initializeUserLocation() {
    if (!navigator.geolocation) {
        uiModule.showNotification('您的瀏覽器不支援地理定位', 'warning');
        await loadAndProcessData();
        chatModule.sendJoinMessage();
        return;
    }
    
    try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
        const coords = [pos.coords.longitude, pos.coords.latitude];
        const mapCoords = ol.proj.fromLonLat(coords);
        
        mapModule.map.getView().animate({ center: mapCoords, zoom: 16 });
        mapModule.userLocationOverlay.setPosition(mapCoords);
        $('#user-location').removeClass('hidden');

        const city = await api.reverseGeocodeForCity(coords[0], coords[1]);
        chatModule.setCurrentUserCity(city);
        await loadAndProcessData(city);
        
    } catch (err) {
        uiModule.showNotification('無法取得您的位置，將載入預設資料。', 'warning');
        await loadAndProcessData();
    } finally {
        chatModule.sendJoinMessage();
    }
}

/**
 * 處理來自其他模組的資料刷新請求。
 * @param {CustomEvent} event - 自訂事件。
 */
async function handleDataRefresh(event) {
    const source = event.detail?.source;
    uiModule.showNotification('正在更新列表...', 'info');
    await loadAndProcessData();
    
    if (source === 'review') {
        const activeTab = $('#pending-tab').hasClass('border-indigo-500') ? 'pending' : 'approved';
        managementModule.loadReviewData(activeTab); 
    }
}

/**
 * 應用程式初始化函式。
 */
async function main() {
    // 樣式調整
    if (navigator.userAgent.toLowerCase().includes("line")) {
        document.documentElement.style.setProperty('--mobile-bottom-offset', '4rem');
    }
    document.documentElement.style.setProperty('--map-filter-style', 
        `contrast(${config.MAP_FILTER_CONTRAST}) saturate(${config.MAP_FILTER_SATURATE}) brightness(${config.MAP_FILTER_BRIGHTNESS})`
    );

    // 初始化所有模組的事件監聽器
    uiModule.setupEventListeners();
    gridModule.setupGridToolbar();
    chatModule.initializeChat();
    chatModule.setupChatListeners();
    addLocationModule.setupAddLocationListeners();
    managementModule.setupManagementListeners();
    authModule.setupAuthListeners();
    // 修改：將地圖點擊事件的處理函式改為 uiModule 中的版本
    mapModule.map.on('singleclick', uiModule.handleMapClick);
    document.addEventListener('refresh-data', handleDataRefresh);

    // 認證與資料載入流程
    const isLoggedIn = await authModule.verifyToken();
    if (!isLoggedIn && !navigator.userAgent.toLowerCase().includes("line")) {
        authModule.initializeGoogleButton();
    }
    await initializeUserLocation();

    // 修改：當所有主要資料載入完成後，預先載入聊天歷史紀錄
    chatModule.preloadHistory();
}

// 啟動
document.addEventListener('DOMContentLoaded', main);
