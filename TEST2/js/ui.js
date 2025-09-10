/**
 * @file 管理所有與 UI 互動相關的邏輯。
 */
import { categoryColors, legendIcons, allCategories } from './config.js';
import * as api from './api.js';
import { getLoginStatus, triggerLogin } from './auth.js';
import { map, infoOverlay, clusterSource, areaGridLayer, clusterLayer } from './map.js';

// --- UI 狀態管理 ---
export const uiState = {
    currentFeatureData: null,
    userVotes: {},
    isDesktopAddMode: false,
    isDrawingOnGrid: false,
};
let allMapFeatures = [];
let fuseSearch = null;

/**
 * 載入使用者投票紀錄。
 */
function loadUserVotes() {
    try {
        const stored = localStorage.getItem('userBlacklistVotes');
        uiState.userVotes = stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error("無法載入使用者投票紀錄:", e);
        uiState.userVotes = {};
    }
}

/**
 * 儲存使用者投票紀錄。
 */
function saveUserVotes() {
    try {
        localStorage.setItem('userBlacklistVotes', JSON.stringify(uiState.userVotes));
    } catch (e) {
        console.error("無法儲存使用者投票紀錄:", e);
    }
}

/**
 * 顯示短暫的通知訊息。
 * @param {string} message - 要顯示的訊息。
 * @param {'info'|'success'|'warning'|'error'} type - 訊息類型。
 */
export function showNotification(message, type = 'info') {
    const $notification = $('#notification');
    $notification.text(message).removeClass('hidden bg-blue-500 bg-green-500 bg-red-500 bg-yellow-500');
    
    switch(type) {
        case 'error':   $notification.addClass('bg-red-500'); break;
        case 'success': $notification.addClass('bg-green-500'); break;
        case 'warning': $notification.addClass('bg-yellow-500'); break;
        default:        $notification.addClass('bg-blue-500');
    }
    
    setTimeout(() => $notification.addClass('hidden'), 5000);
}

/**
 * 隱藏通知訊息。
 */
export function hideNotification() {
    $('#notification').addClass('hidden');
}

/**
 * 設定從 main.js 傳入的搜尋資料。
 * @param {Fuse} fuseInstance - Fuse.js 實例。
 * @param {Array} features - 所有地圖 features。
 */
export function setSearchableData(fuseInstance, features) {
    fuseSearch = fuseInstance;
    allMapFeatures = features;
}

/**
 * 根據目前地圖視野更新店家列表。
 */
export function updateStoreList() {
    if (!map) return; // 確保地圖已初始化
    const extent = map.getView().calculateExtent(map.getSize());
    const $listContent = $('#store-list-content').empty();
    const activeCategory = $('#store-list-filters .active').data('category');
    let count = 0;
    
    const uniqueFeatures = new Set();

    if (clusterSource) {
        clusterSource.forEachFeatureInExtent(extent, (cluster) => {
            cluster.get('features').forEach(feature => {
                uniqueFeatures.add(feature);
            });
        });
    }

    uniqueFeatures.forEach(feature => {
        if (count >= 200) return;
        const category = feature.get('category');
        if (!activeCategory || category === activeCategory) {
             const address = feature.get('address');
             const shortAddress = formatAddress(address);
             const color = categoryColors[category] || categoryColors['其他'];
             const $item = $(`
                <div class="flex items-center text-sm py-1.5 px-2 cursor-pointer hover:bg-gray-200 rounded-md store-list-item">
                    <span class="h-2.5 w-2.5 rounded-full mr-2 flex-shrink-0" style="background-color: ${color};"></span>
                    <span class="truncate">${shortAddress}</span>
                </div>
             `).data('feature', feature);
             $listContent.append($item);
             count++;
        }
    });
}

/**
 * 渲染地圖彈出視窗 (Popup)。
 * @param {Object} featureData - Feature 的屬性資料。
 * @param {ol.Coordinate} coordinates - Feature 的座標。
 */
export function renderPopup(featureData, coordinates) {
    const reportsByFullAddress = new Map();
    featureData.reports.forEach(report => {
        const fullAddr = report['地址'];
        if (!reportsByFullAddress.has(fullAddr)) {
            reportsByFullAddress.set(fullAddr, []);
        }
        reportsByFullAddress.get(fullAddr).push(report);
    });

    if (reportsByFullAddress.size > 1) {
        renderUnitListPopup(featureData, reportsByFullAddress);
    } else {
        renderConsolidatedPopup(featureData, featureData.reports);
    }
    infoOverlay.setPosition(coordinates);
}


function renderUnitListPopup(featureData, reportsByFullAddress) {
    const shortAddress = formatAddress(featureData.address);
    const sortedAddresses = Array.from(reportsByFullAddress.keys()).sort(compareAddresses);

    let listHtml = sortedAddresses.map(fullAddr => {
        const addrMatch = fullAddr.match(/(\d.*)/);
        const displayAddr = addrMatch ? addrMatch[1].trim() : fullAddr;
        return `
            <li class="border-t py-2 px-1 cursor-pointer hover:bg-gray-100 rounded unit-item" data-address="${encodeURIComponent(fullAddr)}">
                <p class="font-semibold truncate" title="${fullAddr}">${displayAddr}</p>
            </li>
        `;
    }).join('');

    $('#popup-content').html(`
        <h3 class="text-lg font-bold text-gray-800">${shortAddress}</h3>
        ${renderVoteSection(featureData)}
        <p class="text-sm text-gray-600 my-2 border-t pt-2">此地點有多筆回報，請選擇查看：</p>
        <ul class="text-sm max-h-40 overflow-y-auto custom-scrollbar pr-2">${listHtml}</ul>
    `);
}

function renderConsolidatedPopup(featureData, reports) {
    const shortAddress = formatAddress(reports[0]['地址']);
    let reportsHtml = reports.map(report => {
        const dateString = report.timestamp ? new Date(report.timestamp).toLocaleDateString('zh-TW') : '日期不明';
        return `
            <div class="border-t pt-2 mt-2">
                <p class="text-xs text-gray-500">${report.submitterName || '匿名'} &bull; ${dateString}</p>
                <p class="font-semibold">${report['黑名類別']}</p>
                <p class="whitespace-pre-wrap">${report['黑名原因'] || ''}</p>
            </div>
        `;
    }).join('');

    $('#popup-content').html(`
        <h3 class="text-lg font-bold text-gray-800">${shortAddress}</h3>
        ${renderVoteSection(featureData)}
        <div class="text-sm mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
            ${reportsHtml}
        </div>
    `);
}

function renderVoteSection(featureData) {
    const likes = featureData.likes || 0;
    const dislikes = featureData.dislikes || 0;
    const score = likes - dislikes;
    let scoreColor = 'text-gray-600';
    if (score > 0) scoreColor = 'text-green-600';
    if (score < 0) scoreColor = 'text-red-600';

    const locationId = featureData.address;
    const userVote = uiState.userVotes[locationId];

    return `
        <div class="flex items-center justify-between text-sm mt-2">
            <span>總評分 (<span class="score-display ${scoreColor} font-bold">${score}</span>)</span>
            <div class="flex items-center space-x-2">
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${userVote === 'like' ? 'voted-like' : ''}" data-vote-type="like">
                    <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333V17a1 1 0 001 1h6.364a1 1 0 00.949-.684l2.121-6.364A1 1 0 0015.364 9H12V4a1 1 0 00-1-1h-1a1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.4 10.333zM6 8h2.545M5 10.5a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 013 0v3a1.5 1.5 0 01-1.5 1.5z"/></svg>
                </button>
                 <span class="likes-count text-sm text-gray-600">${likes}</span>
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${userVote === 'dislike' ? 'voted-dislike' : ''}" data-vote-type="dislike">
                    <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667V3a1 1 0 00-1-1h-6.364a1 1 0 00-.949.684L3.565 9H6v7a1 1 0 001 1h1a1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.6-4.8zM14 12h-2.545M15 9.5a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-3 0v-3a1.5 1.5 0 011.5 1.5z"/></svg>
                </button>
                 <span class="dislikes-count text-sm text-gray-600">${dislikes}</span>
            </div>
        </div>
    `;
}

/**
 * 填充篩選器下拉選單和地圖圖例。
 */
export function populateFiltersAndLegend() {
    const $categorySelect = $('#category-select').html('<option value="">所有分類</option>');
    const $addCategory = $('#add-category').empty();
    const $legend = $('#legend-content').empty();
    const $storeFilters = $('#store-list-filters').html('<button data-category="" class="store-filter-btn active bg-blue-600 text-white px-2 py-0.5 text-xs rounded-full mr-2 flex-shrink-0">全部</button>');

    allCategories.forEach(cat => {
        if (legendIcons[cat]) {
            $categorySelect.append(`<option value="${cat}">${cat}</option>`);
            $addCategory.append($('<option>', { value: cat, text: cat }));
            $legend.append(`<div class="flex items-center"><img src="${legendIcons[cat]}" class="h-4 w-4 mr-1.5">${cat}</div>`);
            $storeFilters.append(`<button data-category="${cat}" class="store-filter-btn text-nowrap bg-white text-black px-2 py-0.5 text-xs rounded-full mr-2 flex-shrink-0 border" style="border-color: ${categoryColors[cat]};">${cat}</button>`);
        }
    });
}

/**
 * 處理地圖點擊事件，顯示彈出視窗或縮放至聚合點。
 * @param {ol.MapBrowserEvent} evt - 地圖瀏覽器事件。
 */
export function handleMapClick(evt) {
    if (uiState.isDesktopAddMode || uiState.isDrawingOnGrid) return;
    
    let featureClicked = false;
    
    // 優先檢查是否點擊到社區/建築範圍
    const areaFeature = map.forEachFeatureAtPixel(evt.pixel, f => f.get('parentData') ? f : null, {
        layerFilter: layer => layer === areaGridLayer
    });
    
    if(areaFeature) {
        featureClicked = true;
        console.log("點擊到社區範圍:", areaFeature.get('parentData'));
    }

    if (featureClicked) return;

    // [FIXED] 修正圖層篩選，確保能點擊到店家圖示
    const clusterFeature = map.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: layer => layer === clusterLayer
    });

    if (clusterFeature) {
        featureClicked = true;
        const featuresInCluster = clusterFeature.get('features');
        if (featuresInCluster.length > 1) { 
            const extent = ol.extent.createEmpty();
            featuresInCluster.forEach(f => ol.extent.extend(extent, f.getGeometry().getExtent()));
            map.getView().fit(extent, { duration: 500, padding: [80, 80, 80, 80] });
        } else { 
            const originalFeature = featuresInCluster[0];
            const coordinates = originalFeature.getGeometry().getCoordinates();
            uiState.currentFeatureData = originalFeature.getProperties();
            
            map.getView().animate({ center: coordinates, zoom: 19, duration: 800 });
            renderPopup(uiState.currentFeatureData, coordinates);
        }
    }

    if (!featureClicked) {
        infoOverlay.setPosition(undefined);
    }
}


// --- 事件處理函式 ---

function handleVoteClick(e) {
    if (!getLoginStatus()) {
        showNotification('請先登入才能評分！', 'warning');
        triggerLogin();
        return;
    }
    const $btn = $(e.currentTarget);
    const voteType = $btn.data('vote-type');
    const locationId = uiState.currentFeatureData.address;
    const previousVote = uiState.userVotes[locationId];

    let likeChange = 0, dislikeChange = 0;

    if (previousVote === voteType) { // 取消投票
        uiState.userVotes[locationId] = null;
        voteType === 'like' ? likeChange = -1 : dislikeChange = -1;
    } else if (previousVote) { // 更改投票
        uiState.userVotes[locationId] = voteType;
        likeChange = voteType === 'like' ? 1 : -1;
        dislikeChange = voteType === 'dislike' ? 1 : -1;
    } else { // 新投票
        uiState.userVotes[locationId] = voteType;
        voteType === 'like' ? likeChange = 1 : dislikeChange = 1;
    }
    
    saveUserVotes();
    
    uiState.currentFeatureData.likes += likeChange;
    uiState.currentFeatureData.dislikes += dislikeChange;
    
    renderPopup(uiState.currentFeatureData, infoOverlay.getPosition());

    api.sendVote(uiState.currentFeatureData.reports, voteType, likeChange || dislikeChange);
}

function handleFilterApply() {
    const category = $('#category-select').val();
    const keyword = $('#keyword-search').val();
    
    let results = allMapFeatures;

    if (keyword && fuseSearch) {
        const { pinyin } = pinyinPro;
        const pinyinKeyword = pinyin(keyword, { pattern: 'pinyin', toneType: 'none', removeNonZh: true });
        results = fuseSearch.search(pinyinKeyword).map(r => r.item);
    }

    const vectorSource = clusterSource.getSource();
    const finalFeatures = results.filter(f => 
        f.get('approved') && (!category || f.get('category') === category)
    );
    
    vectorSource.clear();
    vectorSource.addFeatures(finalFeatures);
    updateStoreList(); 
    $('#filter-modal').addClass('hidden');
}

function handleFilterReset() {
    $('#category-select, #keyword-search').val('');
    const vectorSource = clusterSource.getSource();
    vectorSource.clear();
    vectorSource.addFeatures(allMapFeatures.filter(f => f.get('approved')));
    updateStoreList();
}

async function handleSearch() {
    const address = $('#search-address-input').val().trim();
    if (!address) return;
    
    showNotification('正在搜尋地址...', 'info');
    const data = await api.geocodeAddress(address);
    
    if (data?.results?.length > 0) {
        hideNotification();
        const loc = data.results[0].geometry.location;
        const coords = ol.proj.fromLonLat([loc.lng, loc.lat]);
        map.getView().animate({ center: coords, zoom: 17, duration: 800 });
        $('#search-panel').addClass('hidden');
    } else {
        showNotification('找不到您輸入的地址', 'error');
    }
}


// --- 輔助函式 ---
function formatAddress(address) {
    if (!address) return '';
    const match = address.match(/([^縣市區鄉鎮鎮]+(?:路|街|大道|巷|村|里).*)/);
    return match ? match[1] : address;
}
function extractAddressNumbers(address) {
    if (!address) return [Infinity];
    address = address.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 65248)).replace(/地下/g, 'B').replace(/之/g, '.');
    const numbers = address.match(/B?\d+(\.\d+)?/g);
    return numbers ? numbers.map(n => n.startsWith('B') ? -parseFloat(n.substring(1)) : parseFloat(n)) : [Infinity];
}
function compareAddresses(a, b) {
    const numsA = extractAddressNumbers(a), numsB = extractAddressNumbers(b);
    for (let i = 0; i < Math.min(numsA.length, numsB.length); i++) {
        if (numsA[i] !== numsB[i]) return numsA[i] - numsB[i];
    }
    return numsA.length - numsB.length;
}

/**
 * 初始化所有 UI 相關的事件監聽器。
 */
export function setupEventListeners() {
    loadUserVotes();
    
    $('#popup-closer').on('click', () => infoOverlay.setPosition(undefined));
    $('#popup').on('click', '.unit-item', (e) => {
        const fullAddress = decodeURIComponent($(e.currentTarget).data('address'));
        const reportsForUnit = uiState.currentFeatureData.reports.filter(r => r['地址'] === fullAddress);
        renderConsolidatedPopup(uiState.currentFeatureData, reportsForUnit);
    });
    $('#popup').on('click', '.vote-btn', handleVoteClick);
    
    $('#center-on-me-btn').on('click', () => {
        const pos = map.getOverlayById('userLocation')?.getPosition();
        if (pos) {
            map.getView().animate({ center: pos, zoom: 18, duration: 800 });
        } else {
            showNotification('無法定位您的位置，請確認瀏覽器權限。', 'warning');
        }
    });

    $('#search-address-btn').on('click', async () => {
        $('#search-panel').toggleClass('hidden');
        if (!$('#search-panel').hasClass('hidden')) {
            $('#search-address-input').val('').focus();
            try {
                const text = await navigator.clipboard.readText();
                if (text && ['區', '路', '街', '巷'].some(k => text.includes(k))) {
                    $('#search-address-input').val(text);
                    handleSearch();
                }
            } catch (err) { /* clipboard permission denied */ }
        }
    });
    $('#close-search-panel').on('click', () => $('#search-panel').addClass('hidden'));
    $('#search-address-input').on('keydown', e => e.key === 'Enter' && handleSearch());

    $('#open-filter-modal').on('click', () => $('#filter-modal').removeClass('hidden'));
    $('#close-filter-modal').on('click', () => $('#filter-modal').addClass('hidden'));
    $('#filter-btn').on('click', handleFilterApply);
    $('#reset-btn').on('click', handleFilterReset);

    $('#close-product-modal').on('click', () => $('#product-modal').addClass('hidden'));

    $('#store-list-filters').on('click', '.store-filter-btn', function() {
        $(this).addClass('active').siblings().removeClass('active');
        $('.store-filter-btn').removeClass('bg-blue-600 text-white text-red-600').addClass('bg-white text-black');
        $('.store-filter-btn.active').each(function() {
            const cat = $(this).data('category');
            if(cat === '') $(this).addClass('bg-blue-600 text-white');
            else $(this).addClass('text-red-600');
        });
        updateStoreList();
    });
    $('#store-list-content').on('click', '.store-list-item', function() {
        const feature = $(this).data('feature');
        const coordinates = feature.getGeometry().getCoordinates();
        map.getView().animate({ center: coordinates, zoom: 18, duration: 800 });
        setTimeout(() => renderPopup(feature.getProperties(), coordinates), 200);
    });

    if (map) {
        map.on('moveend', updateStoreList);
    }
}

