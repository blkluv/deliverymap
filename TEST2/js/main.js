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
let rawReports = [];

// --- 讀取畫面管理 ---
let isLoaderHidden = false;
function hideLoadingScreen() {
    if (isLoaderHidden) return;
    isLoaderHidden = true;
    const loader = document.getElementById('loading-overlay');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500); // 等待淡出動畫結束
    }
}

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
            throw new Error('從伺服器取得的資料為空，請檢查後端設定。');
        }

        managementModule.setRawReports(rawReports);
        processRawData(rawReports);

        uiModule.populateFiltersAndLegend();
        uiModule.updateStoreList();
        uiModule.hideNotification();
    } catch (error) {
        console.error("資料載入與處理失敗:", error);
        uiModule.showNotification(`無法載入資料：${error.message}`, 'error');
        hideLoadingScreen(); // 即使資料載入失敗，也要確保讀取畫面會消失
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
    const allFeatures = [];

    results.forEach(data => {
        if (data.isCommunity) communityAreas.push(data);
        const baseAddress = (data['地址'] || '').split(/樓|之|-/)[0].trim();
        if (baseAddress) {
            if (!groupedData.has(baseAddress)) groupedData.set(baseAddress, []);
            groupedData.get(baseAddress).push(data);
        }
    });

    if (!mapModule.vectorSource || !mapModule.areaGridSource) return;

    mapModule.vectorSource.clear();
    mapModule.areaGridSource.clear();
    
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
 * 處理來自其他模組的資料刷新請求。
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
 * 設置應用程式的動態樣式。
 */
function setupStyles() {
    if (navigator.userAgent.toLowerCase().includes("line")) {
        document.documentElement.style.setProperty('--mobile-bottom-offset', '4rem');
    }
    document.documentElement.style.setProperty('--map-filter-style', 
        `contrast(${config.MAP_FILTER_CONTRAST}) saturate(${config.MAP_FILTER_SATURATE}) brightness(${config.MAP_FILTER_BRIGHTNESS})`
    );
}

/**
 * 註冊所有模組的事件監聽器。
 */
function initializeModules() {
    uiModule.setupEventListeners();
    gridModule.setupGridToolbar();
    chatModule.setupChatListeners();
    addLocationModule.setupAddLocationListeners();
    managementModule.setupManagementListeners();
    authModule.setupAuthListeners();
    if (mapModule.map) {
        mapModule.map.on('singleclick', uiModule.handleMapClick);
    }
    document.addEventListener('refresh-data', handleDataRefresh);
}

/**
 * 處理使用者認證與後續流程。
 */
async function handleAuthentication() {
    const isLineBrowser = navigator.userAgent.toLowerCase().includes("line");
    const isLoggedIn = await authModule.verifyToken();

    if (!isLoggedIn) {
        if (isLineBrowser) {
            await authModule.initializeLiffLogin();
        } else {
            authModule.initializeGoogleButton();
        }
    } else {
        // 如果已經是登入狀態，直接初始化聊天室
        chatModule.initializeChat();
    }
}

/**
 * 根據已取得的位置資訊，完成後續的 UI 更新與資料載入
 * @param {Object} locationData - 從 index.html 的 Promise 取得的位置物件
 */
async function finishInitializationWithLocation(locationData) {
    if (locationData.success) {
        const mapCoords = ol.proj.fromLonLat([locationData.lon, locationData.lat]);
        if (mapModule.userLocationOverlay) {
            mapModule.userLocationOverlay.setPosition(mapCoords);
        }
        $('#user-location').removeClass('hidden');

        const city = await api.reverseGeocodeForCity(locationData.lon, locationData.lat);
        chatModule.setCurrentUserCity(city);
        await loadAndProcessData(city);
    } else {
        uiModule.showNotification('無法取得您的位置，將載入預設資料。', 'warning');
        await loadAndProcessData();
    }
    // 不論定位成功與否，只要登入就發送加入訊息
    chatModule.sendJoinMessage();
}

/**
 * 應用程式初始化函式。
 */
async function main() {
    const loadingTimeout = setTimeout(hideLoadingScreen, 3000);

    try {
        setupStyles(); // 樣式可以先設定

        // 1. 等待 GPS 定位完成
        const initialLocation = await window.initialLocationPromise;
        const centerCoords = ol.proj.fromLonLat([initialLocation.lon, initialLocation.lat]);

        // 2. 使用取得的座標初始化地圖
        mapModule.initMap(centerCoords, initialLocation.zoom);

        // 3. 地圖建立後，才初始化其他模組
        initializeModules();
        
        // 4. 執行認證，成功後會自動初始化聊天室
        await handleAuthentication();
        
        // 5. 執行後續的資料載入
        await finishInitializationWithLocation(initialLocation);
        chatModule.preloadHistory();

    } catch (error) {
        console.error("應用程式初始化失敗:", error);
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.innerHTML = `
                <div class="w-full h-full flex flex-col items-center justify-center text-center p-4">
                    <h1 class="text-2xl font-bold text-red-600">糟糕，程式載入失敗了</h1>
                    <p class="text-gray-700 mt-2">請嘗試重新整理頁面。如果問題持續發生，請回報給管理員。</p>
                    <pre class="mt-4 p-2 bg-gray-100 text-left text-xs text-red-500 rounded-md overflow-auto w-full max-w-lg">${error.stack || error.message}</pre>
                </div>
            `;
        }
    } finally {
        clearTimeout(loadingTimeout);
        hideLoadingScreen();
    }
}

document.addEventListener('DOMContentLoaded', main);

