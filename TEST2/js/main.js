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

        const rawReports = await api.loadData(city);
        if (!rawReports) {
            throw new Error('從伺服器取得的資料為空。');
        }
        
        managementModule.setRawReports(rawReports);
        
        processRawData(rawReports);

        uiModule.populateFiltersAndLegend();
        uiModule.updateStoreList();
        uiModule.hideNotification();
    } catch (error) {
        console.error("資料載入與處理失敗:", error);
        uiModule.showNotification(`無法載入資料：${error.message}`, 'error');
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
    const allFeatures = [];
    
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
 * 根據已取得的位置資訊，完成後續的 UI 更新與資料載入
 * @param {Object} locationData - 從 index.html 的 Promise 取得的位置物件
 */
async function finishInitializationWithLocation(locationData) {
    if (locationData.success) {
        const coords = [locationData.lon, locationData.lat];
        const mapCoords = ol.proj.fromLonLat(coords);
        
        mapModule.userLocationOverlay.setPosition(mapCoords);
        $('#user-location').removeClass('hidden');

        try {
            const city = await api.reverseGeocodeForCity(coords[0], coords[1]);
            chatModule.setCurrentUserCity(city);
            await loadAndProcessData(city);
        } catch (err) {
            console.error("反向地理編碼或資料載入失敗:", err);
            uiModule.showNotification('無法取得您的位置，將載入預設資料。', 'warning');
            await loadAndProcessData();
        }
    } else {
        uiModule.showNotification('無法取得您的位置，將載入預設資料。', 'warning');
        await loadAndProcessData();
    }

    chatModule.sendJoinMessage();
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
    const initialLocation = await window.initialLocationPromise;
    const centerCoords = ol.proj.fromLonLat([initialLocation.lon, initialLocation.lat]);

    mapModule.initMap(centerCoords, initialLocation.zoom);
    
    if (navigator.userAgent.toLowerCase().includes("line")) {
        document.documentElement.style.setProperty('--mobile-bottom-offset', '4rem');
    }
    document.documentElement.style.setProperty('--map-filter-style', 
        `contrast(${config.MAP_FILTER_CONTRAST}) saturate(${config.MAP_FILTER_SATURATE}) brightness(${config.MAP_FILTER_BRIGHTNESS})`
    );

    uiModule.setupEventListeners();
    gridModule.setupGridToolbar();
    chatModule.initializeChat();
    chatModule.setupChatListeners();
    addLocationModule.setupAddLocationListeners();
    managementModule.setupManagementListeners();
    authModule.setupAuthListeners();
    mapModule.map.on('singleclick', uiModule.handleMapClick);
    document.addEventListener('refresh-data', handleDataRefresh);

    const isLineBrowser = navigator.userAgent.toLowerCase().includes("line");
    const isLoggedIn = await authModule.verifyToken();
    
    if (!isLoggedIn) {
        if (isLineBrowser) {
            await authModule.initializeLiffLogin();
        } else {
            authModule.initializeGoogleButton();
        }
    }

    await finishInitializationWithLocation(initialLocation);

    chatModule.preloadHistory();
    
    // [MODIFIED] 在所有初始化完成後，隱藏讀取畫面
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500); // 確保與 CSS 的 transition 時間一致
    }
}

document.addEventListener('DOMContentLoaded', main);

