/**
 * @file 管理使用者介面 (UI) 的各種互動，如彈出視窗、通知、列表更新等。
 */
import { map, infoOverlay, clusterLayer, areaGridLayer, clusterSource, vectorSource } from './map.js';
import { categoryColors, allCategories, legendIcons } from './config.js';
import * as api from './api.js';
import { getLoginStatus } from './auth.js';

// --- 模組內部狀態 ---
let fuse = null;
let allFeatures = [];
let currentFeatureData = null; // 用於儲存當前彈出視窗對應的 feature 資料
let userVotes = JSON.parse(localStorage.getItem('userBlacklistVotes') || '{}');
export const uiState = {
    isDesktopAddMode: false,
    isDrawingOnGrid: false,
    isPainting: false,
};


/**
 * 設置所有 UI 元件的事件監聽器。
 */
export function setupEventListeners() {
    // 彈出視窗關閉按鈕
    $('#popup-closer').on('click', (e) => {
        e.preventDefault();
        infoOverlay.setPosition(undefined);
    });
    
    // 中間的按鈕
    $('#center-on-me-btn').on('click', () => {
        const userPosition = map.getLayers().getArray().find(l => l.get('name') === 'userLocationLayer')?.getSource().getFeatures()[0]?.getGeometry().getCoordinates();
        if (userPosition) {
            map.getView().animate({ center: userPosition, zoom: 16, duration: 800 });
        } else {
            showNotification('無法定位您的位置。', 'warning');
        }
    });

    // 篩選 Modal
    $('#open-filter-modal').on('click', () => $('#filter-modal').removeClass('hidden'));
    $('#close-filter-modal').on('click', () => $('#filter-modal').addClass('hidden'));
    $('#filter-btn').on('click', applyFilters);
    $('#reset-btn').on('click', resetFilters);

    // 搜尋面板
    $('#search-address-btn').on('click', toggleSearchPanel);
    $('#close-search-panel').on('click', () => $('#search-panel').addClass('hidden'));
    $('#search-address-input').on('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch($(e.target).val());
        }
    });

    // 店家列表
    $('#store-list-filters').on('click', '.store-filter-btn', handleStoreFilterClick);
    map.on('moveend', updateStoreList);

    // 彈出視窗內的事件（使用事件委派）
    $('#popup').on('click', handlePopupClicks);
}

/**
 * 處理地圖點擊事件，以顯示彈出視窗或縮放聚合點。
 * @param {ol.MapBrowserEvent} evt - 地圖瀏覽器事件。
 */
export function handleMapClick(evt) {
    if (uiState.isDesktopAddMode || uiState.isDrawingOnGrid) return;

    let featureClicked = false;
    
    const areaFeature = map.forEachFeatureAtPixel(evt.pixel, f => f.get('parentData') ? f : null, {
        layerFilter: layer => layer === areaGridLayer
    });
    
    if(areaFeature) {
        featureClicked = true;
        console.log("Clicked on area:", areaFeature.get('parentData'));
    }

    if (featureClicked) return;

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
            currentFeatureData = originalFeature.getProperties();
            
            map.getView().animate({ center: coordinates, zoom: 18, duration: 800 });
            renderPopupContent(currentFeatureData);
            infoOverlay.setPosition(coordinates);
        }
    }

    if (!featureClicked) {
        infoOverlay.setPosition(undefined);
    }
}


/**
 * 設定可用於搜尋的資料 (Fuse.js 實例和原始 features)。
 * @param {Fuse} fuseInstance - Fuse.js 的實例。
 * @param {Array<ol.Feature>} features - 所有地點的 features 陣列。
 */
export function setSearchableData(fuseInstance, features) {
    fuse = fuseInstance;
    allFeatures = features;
}

/**
 * 顯示一個短暫的通知訊息。
 * @param {string} message - 要顯示的訊息。
 * @param {'info'|'success'|'warning'|'error'} type - 訊息類型。
 */
export function showNotification(message, type = 'info') {
    const $notification = $('#notification');
    $notification.text(message).removeClass('hidden');
    $notification.removeClass('bg-blue-500 bg-green-500 bg-red-500 bg-yellow-500');
    switch(type) {
        case 'error': $notification.addClass('bg-red-500'); break;
        case 'success': $notification.addClass('bg-green-500'); break;
        case 'warning': $notification.addClass('bg-yellow-500'); break;
        default: $notification.addClass('bg-blue-500');
    }
    setTimeout(() => $notification.addClass('hidden'), 5000);
}

export function hideNotification() {
    $('#notification').addClass('hidden');
}


/**
 * 根據目前的資料，填充篩選器下拉選單和地圖圖例。
 */
export function populateFiltersAndLegend() {
    const $categorySelect = $('#category-select');
    const $addCategorySelect = $('#add-category');
    const $legendContent = $('#legend-content');
    const $storeListFilters = $('#store-list-filters');
    
    $categorySelect.html('<option value="">所有分類</option>');
    $addCategorySelect.html('');
    $legendContent.html('');
    $storeListFilters.html('<button data-category="" class="store-filter-btn active bg-blue-600 text-white px-2 py-0.5 text-xs rounded-full mr-2 flex-shrink-0">全部</button>');
    
    allCategories.forEach(category => {
         if (legendIcons[category]) {
            $categorySelect.append(`<option value="${category}">${category}</option>`);
            $addCategorySelect.append($('<option>', { value: category, text: category }));
            $legendContent.append(`<div class="flex items-center"><img src="${legendIcons[category]}" class="h-4 w-4 mr-1.5">${category}</div>`);
            $storeListFilters.append(`<button data-category="${category}" class="store-filter-btn text-nowrap bg-white text-black px-2 py-0.5 text-xs rounded-full mr-2 flex-shrink-0 border" style="border-color: ${categoryColors[category]};">${category}</button>`);
         }
    });
}


/**
 * 更新地圖左側的店家列表。
 */
export function updateStoreList() {
    const extent = map.getView().calculateExtent(map.getSize());
    const $listContent = $('#store-list-content').empty();
    const activeCategory = $('#store-list-filters .active').data('category');
    
    const uniqueFeatures = [];
    const featureKeys = new Set();

    // 修正：應從 clusterSource (資料來源) 中獲取 features，而不是 map (地圖物件)
    clusterSource.forEachFeatureInExtent(extent, (cluster) => {
        const features = cluster.get('features');
        features.forEach(function(feature) {
            if (!featureKeys.has(feature.getId())) {
                uniqueFeatures.push(feature);
                featureKeys.add(feature.getId());
            }
        });
    });

    uniqueFeatures.slice(0, 200).forEach(feature => {
        const category = feature.get('category');
        if (!activeCategory || category === activeCategory) {
             const address = feature.get('address');
             const shortAddress = address.match(/([^縣市區鄉鎮鎮]+(?:路|街|大道|巷|村|里).*)/)?.[1] || address;
             const color = categoryColors[category] || categoryColors['其他'];
             
             const $listItem = $(`
                <div class="flex items-center text-sm py-1.5 px-2 cursor-pointer hover:bg-gray-200 rounded-md">
                    <span class="h-2.5 w-2.5 rounded-full mr-2 flex-shrink-0" style="background-color: ${color}"></span>
                    <span class="truncate">${shortAddress}</span>
                </div>
             `);
             $listItem.on('click', () => {
                 const coordinates = feature.getGeometry().getCoordinates();
                 map.getView().animate({ center: coordinates, zoom: 18 });
                 setTimeout(() => {
                     currentFeatureData = feature.getProperties();
                     renderPopupContent(currentFeatureData);
                     infoOverlay.setPosition(coordinates);
                 }, 800);
             });
             $listContent.append($listItem);
        }
    });
}


// --- 私有輔助函式 ---

function applyFilters() {
    const category = $('#category-select').val();
    const keyword = $('#keyword-search').val();
    
    let results = allFeatures;

    if (keyword && fuse) {
        const pinyinKeyword = pinyinPro.pinyin(keyword, { pattern: 'pinyin', toneType: 'none' });
        results = fuse.search(pinyinKeyword).map(result => result.item);
    }

    const finalFeatures = results.filter(feature => {
        return (!category || feature.get('category') === category);
    });
    
    vectorSource.clear();
    vectorSource.addFeatures(finalFeatures);
    updateStoreList(); 
    $('#filter-modal').addClass('hidden');
}

function resetFilters() {
    $('#category-select, #keyword-search').val('');
    vectorSource.clear();
    vectorSource.addFeatures(allFeatures);
    updateStoreList();
}


async function toggleSearchPanel() {
    const $searchPanel = $('#search-panel');
    if ($searchPanel.hasClass('hidden')) {
        $searchPanel.removeClass('hidden').find('input').val('').focus();
        try {
            const text = await navigator.clipboard.readText();
            if (text && ['區', '路', '街', '巷'].some(k => text.includes(k))) {
                $('#search-address-input').val(text);
                performSearch(text);
            }
        } catch (err) {
            // Clipboard access denied or not supported
        }
    } else {
        $searchPanel.addClass('hidden');
    }
}

async function performSearch(address) {
    if (!address) return;
    showNotification('正在搜尋地址...', 'info');
    const data = await api.geocodeAddress(address);
    if (data?.results?.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = ol.proj.fromLonLat([location.lng, location.lat]);
        map.getView().animate({ center: coords, zoom: 17 });
        $('#search-panel').addClass('hidden');
        hideNotification();
    } else {
        showNotification('找不到您輸入的地址', 'error');
    }
}

function handleStoreFilterClick() {
    const $btn = $(this);
    const category = $btn.data('category');
    
    $('.store-filter-btn').removeClass('active text-white bg-blue-600 text-red-600').addClass('text-black bg-white');
    $btn.addClass('active').toggleClass('bg-blue-600 text-white', !category).toggleClass('text-red-600', !!category);
    
    updateStoreList();
}


function renderPopupContent(featureData) {
    const reportsByAddress = new Map();
    featureData.reports.forEach(report => {
        const fullAddr = report['地址'];
        if (!reportsByAddress.has(fullAddr)) reportsByAddress.set(fullAddr, []);
        reportsByAddress.get(fullAddr).push(report);
    });

    if (reportsByAddress.size > 1) {
        renderUnitListPopup(featureData, reportsByAddress);
    } else {
        renderConsolidatedPopup(featureData, featureData.reports);
    }
}

function renderUnitListPopup(featureData, reportsByAddress) {
    const shortAddress = featureData.address.match(/([^縣市區鄉鎮鎮]+(?:路|街|大道|巷|村|里).*)/)?.[1] || featureData.address;
    const sortedAddresses = Array.from(reportsByAddress.keys()).sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.match(/\d+/)?.[0] || 0);
        return numA - numB;
    });

    const listHtml = sortedAddresses.map(fullAddr => `
        <li class="border-t py-2 px-1 cursor-pointer hover:bg-gray-100 rounded unit-item" data-address="${encodeURIComponent(fullAddr)}">
            <p class="font-semibold truncate">${fullAddr.replace(shortAddress, '').trim() || fullAddr}</p>
        </li>
    `).join('');

    $('#popup-content').html(`
        <h3 class="text-lg font-bold">${shortAddress}</h3>
        ${renderVoteSection(featureData)}
        <p class="text-sm text-gray-600 my-2 border-t pt-2">此地點有多筆回報：</p>
        <ul class="text-sm max-h-40 overflow-y-auto custom-scrollbar pr-2">${listHtml}</ul>
    `);
}

function renderConsolidatedPopup(featureData, reports) {
    const shortAddress = reports[0]['地址'].match(/([^縣市區鄉鎮鎮]+(?:路|街|大道|巷|村|里).*)/)?.[1] || reports[0]['地址'];
    const reportsHtml = reports.map(report => `
        <div class="border-t pt-2 mt-2">
            <p class="text-xs text-gray-500">${report.submitterName || '匿名'} &bull; ${new Date(report.timestamp).toLocaleDateString()}</p>
            <p class="font-semibold">${report['黑名類別']}</p>
            <p class="whitespace-pre-wrap">${report['黑名原因'] || ''}</p>
        </div>
    `).join('');

    $('#popup-content').html(`
        <h3 class="text-lg font-bold">${shortAddress}</h3>
        ${renderVoteSection(featureData)}
        <div class="text-sm mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">${reportsHtml}</div>
    `);
}


function renderVoteSection(featureData) {
    const likes = featureData.likes || 0;
    const dislikes = featureData.dislikes || 0;
    const score = likes - dislikes;
    const scoreColor = score > 0 ? 'text-green-600' : score < 0 ? 'text-red-600' : 'text-gray-600';
    const userVote = userVotes[featureData.address];

    return `
        <div class="flex items-center justify-between text-sm mt-2">
            <span>總評分 (<span class="score-display ${scoreColor} font-bold">${score}</span>)</span>
            <div class="flex items-center space-x-2">
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${userVote === 'like' ? 'voted-like' : ''}" data-vote-type="like">
                    <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333V17a1 1 0 001 1h6.364a1 1 0 00.949-.684l2.121-6.364A1 1 0 0015.364 9H12V4a1 1 0 00-1-1h-1a1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.4 10.333zM6 8h2.545M5 10.5a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 013 0v3a1.5 1.5 0 01-1.5 1.5z"/></svg>
                </button>
                 <span class="likes-count text-sm">${likes}</span>
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${userVote === 'dislike' ? 'voted-dislike' : ''}" data-vote-type="dislike">
                    <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667V3a1 1 0 00-1-1h-6.364a1 1 0 00-.949.684L3.565 9H6v7a1 1 0 001 1h1a1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.6-4.8zM14 12h-2.545M15 9.5a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-3 0v-3a1.5 1.5 0 011.5-1.5z"/></svg>
                </button>
                 <span class="dislikes-count text-sm">${dislikes}</span>
            </div>
        </div>
    `;
}

function handlePopupClicks(e) {
    const $target = $(e.target);
    
    const $unitItem = $target.closest('.unit-item');
    if ($unitItem.length && currentFeatureData) {
        const fullAddress = decodeURIComponent($unitItem.data('address'));
        const reportsForUnit = currentFeatureData.reports.filter(r => r['地址'] === fullAddress);
        renderConsolidatedPopup(currentFeatureData, reportsForUnit);
        return;
    }

    const $voteBtn = $target.closest('.vote-btn');
    if ($voteBtn.length && currentFeatureData) {
        if (!getLoginStatus()) {
            showNotification('請先登入才能評分！', 'warning');
            return;
        }
        
        const locationId = currentFeatureData.address;
        const voteType = $voteBtn.data('vote-type');
        const previousVote = userVotes[locationId];

        let likeChange = 0, dislikeChange = 0;

        if (previousVote === voteType) { 
            userVotes[locationId] = null;
            voteType === 'like' ? likeChange = -1 : dislikeChange = -1;
        } else {
            if (previousVote) voteType === 'like' ? (likeChange = 1, dislikeChange = -1) : (likeChange = -1, dislikeChange = 1);
            else voteType === 'like' ? likeChange = 1 : dislikeChange = 1;
            userVotes[locationId] = voteType;
        }
        
        localStorage.setItem('userBlacklistVotes', JSON.stringify(userVotes));
        
        const $popup = $voteBtn.closest('#popup-content');
        const newLikes = (currentFeatureData.likes || 0) + likeChange;
        const newDislikes = (currentFeatureData.dislikes || 0) + dislikeChange;
        currentFeatureData.likes = newLikes;
        currentFeatureData.dislikes = newDislikes;

        $popup.find('.likes-count').text(newLikes);
        $popup.find('.dislikes-count').text(newDislikes);
        $popup.find('.score-display').text(newLikes - newDislikes);
        
        $popup.find('.vote-btn').removeClass('voted-like voted-dislike');
        if(userVotes[locationId]) $popup.find(`.vote-btn[data-vote-type="${userVotes[locationId]}"]`).addClass(`voted-${userVotes[locationId]}`);

        api.sendVote(locationId, voteType, change, currentFeatureData.reports);
    }
}

