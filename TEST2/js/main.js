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
        // 即使資料載入失敗，也要確保讀取畫面會消失
        hideLoadingScreen();
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
    chatModule.initializeChat();
    chatModule.setupChatListeners();
    addLocationModule.setupAddLocationListeners();
    managementModule.setupManagementListeners();
    authModule.setupAuthListeners();
    mapModule.map.on('singleclick', uiModule.handleMapClick);
    document.addEventListener('refresh-data', handleDataRefresh);
}

/**
 * 處理使用者認證流程。
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
    }
}


/**
 * 應用程式初始化函式。
 */
async function main() {
    // 設定一個最多 3 秒的保險計時器，確保讀取畫面一定會消失
    const loadingTimeout = setTimeout(hideLoadingScreen, 3000);

    try {
        setupStyles();
        initializeModules();
        await handleAuthentication();
        await initializeUserLocation();
        chatModule.preloadHistory();
    } catch (error) {
        console.error("應用程式初始化失敗:", error);
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.innerHTML = `
                <div class="w-full h-full flex flex-col items-center justify-center text-center p-4">
                    <h1 class="text-2xl font-bold text-red-600">糟糕，程式載入失敗了</h1>
                    <p class="text-gray-700 mt-2">請嘗試重新整理頁面。如果問題持續發生，請回報給管理員。</p>
                    <pre class="mt-4 p-2 bg-gray-100 text-left text-xs text-red-500 rounded-md overflow-auto w-full max-w-lg">${error.message}</pre>
                </div>
            `;
        }
    } finally {
        // 清除保險計時器，並在所有程序完成後隱藏讀取畫面
        clearTimeout(loadingTimeout);
        hideLoadingScreen();
    }
}

// 啟動
document.addEventListener('DOMContentLoaded', main);

