/**
 * @file 管理所有 UI 互動、DOM 操作和事件監聽。
 */
import { categoryColors, legendIcons, allCategories } from './config.js';
import { map, vectorSource, clusterSource, infoOverlay, userPositionCoords } from './map.js';
import { geocodeAddress, sendVote } from './api.js';
import { getLoginStatus } from './auth.js';

// --- 模組內變數 ---
let allFeatures = [];
let fuse = null;
let currentFeatureData = null; // 用於儲存彈出視窗的當前 feature 資料
let userVotes = {}; // 用於儲存使用者的投票紀錄
let pinyin; // 由主模組初始化

// --- Setter 函式 ---
export function setDependencies(features, pinyinFn, votes) {
    allFeatures = features;
    fuse = new Fuse(allFeatures, {
        includeScore: true,
        threshold: 0.1,
        minMatchCharLength: 2,
        ignoreLocation: true,
        keys: ['values_.address_pinyin', 'values_.reports.blacklistReason']
    });
    pinyin = pinyinFn;
    userVotes = votes;
}

// --- UI 更新函式 ---

/**
 * 顯示一個短暫的通知訊息。
 * @param {string} message - 要顯示的訊息。
 * @param {string} type - 'info', 'success', 'error', 'warning'。
 */
export function showNotification(message, type = 'info') {
    const $notification = $('#notification');
    $notification.text(message).removeClass('hidden');
    $notification.removeClass('bg-blue-500 bg-green-500 bg-red-500 bg-yellow-500');
    switch (type) {
        case 'error': $notification.addClass('bg-red-500'); break;
        case 'success': $notification.addClass('bg-green-500'); break;
        case 'warning': $notification.addClass('bg-yellow-500'); break;
        default: $notification.addClass('bg-blue-500');
    }
    setTimeout(() => $notification.addClass('hidden'), 5000);
}

/**
 * 填充篩選器下拉選單和地圖圖例。
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
            const iconSrc = legendIcons[category];
            $legendContent.append(`<div class="flex items-center"><img src="${iconSrc}" class="h-4 w-4 mr-1.5">${category}</div>`);
            $storeListFilters.append(`<button data-category="${category}" class="store-filter-btn text-nowrap bg-white text-black px-2 py-0.5 text-xs rounded-full mr-2 flex-shrink-0 border" style="border-color: ${categoryColors[category]};">${category}</button>`);
        }
    });
}

/**
 * 更新地圖上的店家列表面板。
 */
export function updateStoreList() {
    const extent = map.getView().calculateExtent(map.getSize());
    const $listContent = $('#store-list-content');
    const activeCategory = $('#store-list-filters .active').data('category');
    $listContent.html('');

    let count = 0;
    const uniqueFeatures = new Set();

    clusterSource.forEachFeatureInExtent(extent, function(cluster) {
        cluster.get('features').forEach(feature => uniqueFeatures.add(feature));
    });

    Array.from(uniqueFeatures).forEach(feature => {
        if (count >= 200) return;
        const category = feature.get('category');
        if (activeCategory && category !== activeCategory) return;
        
        const address = feature.get('address');
        const shortAddress = formatAddress(address);
        const color = categoryColors[category] || categoryColors['其他'];
        const listItem = $(`
            <div class="flex items-center text-sm py-1.5 px-2 cursor-pointer hover:bg-gray-200 rounded-md store-list-item" data-address="${address}">
                <span class="h-2.5 w-2.5 rounded-full mr-2 flex-shrink-0" style="background-color: ${color}"></span>
                <span class="truncate">${shortAddress}</span>
            </div>
        `);
        $listContent.append(listItem);
        count++;
    });
}


// --- Popup 渲染函式 ---

function renderVoteSection(featureData) {
    const likes = featureData.likes || 0;
    const dislikes = featureData.dislikes || 0;
    const score = likes - dislikes;
    let scoreColor = 'text-gray-600';
    if (score > 0) scoreColor = 'text-green-600';
    if (score < 0) scoreColor = 'text-red-600';

    const locationId = featureData.address;
    const userVote = userVotes[locationId];
    const likeClass = userVote === 'like' ? 'voted-like' : '';
    const dislikeClass = userVote === 'dislike' ? 'voted-dislike' : '';

    return `
        <div class="flex items-center justify-between text-sm mt-2">
            <span>總評分 (<span class="score-display ${scoreColor} font-bold">${score}</span>)</span>
            <div class="flex items-center space-x-2">
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${likeClass}" data-location-id="${locationId}" data-vote-type="like">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333V17a1 1 0 001 1h6.364a1 1 0 00.949-.684l2.121-6.364A1 1 0 0015.364 9H12V4a1 1 0 00-1-1h-1a1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.4 10.333zM6 8h2.545M5 10.5a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 013 0v3a1.5 1.5 0 01-1.5 1.5z"/></svg>
                </button>
                 <span class="likes-count text-sm text-gray-600">${likes}</span>
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${dislikeClass}" data-location-id="${locationId}" data-vote-type="dislike">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667V3a1 1 0 00-1-1h-6.364a1 1 0 00-.949.684L3.565 9H6v7a1 1 0 001 1h1a1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.6-4.8zM14 12h-2.545M15 9.5a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-3 0v-3a1.5 1.5 0 011.5 1.5z"/></svg>
                </button>
                 <span class="dislikes-count text-sm text-gray-600">${dislikes}</span>
            </div>
        </div>
    `;
}

function renderConsolidatedPopup(featureData, reports) {
    const shortAddress = formatAddress(reports[0]['地址']);
    let reportsHtml = reports.map(report => {
        const reportDate = report.timestamp || report.Timestamp;
        const dateString = reportDate ? new Date(reportDate).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '日期不明';
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

// --- 事件監聽器設定 ---

export function setupEventListeners() {
    // 篩選 Modal
    $('#open-filter-modal').on('click', () => $('#filter-modal').removeClass('hidden'));
    $('#close-filter-modal').on('click', () => $('#filter-modal').addClass('hidden'));
    $('#filter-btn').on('click', applyFilters);
    $('#reset-btn').on('click', resetFilters);

    // 回到我的位置
    $('#center-on-me-btn').on('click', () => {
        if (userPositionCoords) map.getView().animate({ center: userPositionCoords, zoom: 16, duration: 800 });
        else showNotification('無法定位您的位置。', 'warning');
    });

    // 搜尋面板
    $('#search-address-btn').on('click', toggleSearchPanel);
    $('#close-search-panel').on('click', () => $('#search-panel').addClass('hidden'));
    $('#search-address-input').on('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch($(e.target).val());
        }
    });

    // 店家列表
    $('#store-list-filters').on('click', '.store-filter-btn', handleStoreFilterClick);
    $('#store-list-content').on('click', '.store-list-item', handleStoreListItemClick);

    // Popup 相關事件
    $('#popup-closer').on('click', e => { e.preventDefault(); infoOverlay.setPosition(undefined); });
    $('#popup').on('click', handlePopupClick);

    // 地圖事件
    map.on('moveend', updateStoreList);
    map.on('singleclick', handleMapClick);
}


// --- 事件處理函式 ---

function applyFilters() {
    const category = $('#category-select').val();
    const keyword = $('#keyword-search').val();
    let results = allFeatures;

    if (keyword && fuse) {
        const pinyinKeyword = pinyin(keyword, { pattern: 'pinyin', toneType: 'none', removeNonZh: true });
        results = fuse.search(pinyinKeyword).map(result => result.item);
    }

    const finalFeatures = results.filter(feature => {
        return feature.get('approved') && (!category || feature.get('category') === category);
    });
    
    vectorSource.clear();
    vectorSource.addFeatures(finalFeatures);
    updateStoreList(); 
    $('#filter-modal').addClass('hidden');
}

function resetFilters() {
    $('#category-select, #keyword-search').val('');
    const approvedFeatures = allFeatures.filter(f => f.get('approved'));
    vectorSource.clear();
    vectorSource.addFeatures(approvedFeatures);
    updateStoreList(); 
}

async function toggleSearchPanel() {
    const $searchPanel = $('#search-panel');
    if ($searchPanel.hasClass('hidden')) { 
        $searchPanel.removeClass('hidden').find('input').val('').focus();
        try {
            const text = await navigator.clipboard.readText();
            if (text && ['區', '路', '街', '巷', '弄', '號'].some(k => text.includes(k))) {
                $('#search-address-input').val(text);
                performSearch(text);
            }
        } catch (err) {
            console.warn('無法讀取剪貼簿。');
        }
    } else {
        $searchPanel.addClass('hidden');
    }
}

async function performSearch(address) {
    if (!address.trim()) return;
    showNotification('正在搜尋地址...', 'info');
    const data = await geocodeAddress(address);
    if (data?.results?.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = ol.proj.fromLonLat([location.lng, location.lat]);
        map.getView().animate({ center: coords, zoom: 17, duration: 800 });
        $('#search-panel').addClass('hidden');
        $('#notification').addClass('hidden');
    } else {
        showNotification('找不到您輸入的地址', 'error');
    }
}

function handleStoreFilterClick(e) {
    const $btn = $(e.currentTarget);
    $('.store-filter-btn').removeClass('active text-white bg-blue-600 text-red-600').addClass('bg-white text-black');
    
    if($btn.data('category') === '') {
        $btn.addClass('active bg-blue-600 text-white');
    } else {
        $btn.addClass('active text-red-600');
    }
    updateStoreList();
}

function handleStoreListItemClick(e) {
    const address = $(e.currentTarget).data('address');
    const feature = allFeatures.find(f => f.get('address') === address);
    if (!feature) return;

    const coordinates = feature.getGeometry().getCoordinates();
    map.getView().animate({ center: coordinates, zoom: 18, duration: 800 });
    
    setTimeout(() => {
        currentFeatureData = feature.getProperties();
        const reportsByFullAddress = groupReportsByFullAddress(currentFeatureData.reports);
        
        if (reportsByFullAddress.size > 1) {
            renderUnitListPopup(currentFeatureData, reportsByFullAddress);
        } else {
            renderConsolidatedPopup(currentFeatureData, currentFeatureData.reports);
        }
        infoOverlay.setPosition(coordinates);
    }, 200);
}

function handlePopupClick(e) {
    const $target = $(e.target);

    // 處理點擊多筆回報中的單一項目
    const $unitItem = $target.closest('.unit-item');
    if ($unitItem.length) {
        const fullAddress = decodeURIComponent($unitItem.data('address'));
        const reportsForUnit = currentFeatureData.reports.filter(r => r['地址'] === fullAddress);
        renderConsolidatedPopup(currentFeatureData, reportsForUnit);
        return;
    }

    // 處理點擊投票按鈕
    const $voteBtn = $target.closest('.vote-btn');
    if ($voteBtn.length) {
        if (!getLoginStatus()) { // 從 auth 模組取得登入狀態
            showNotification('請先登入才能評分！', 'warning');
            return;
        }
        
        const locationId = $voteBtn.data('location-id');
        const voteType = $voteBtn.data('vote-type');
        const previousVote = userVotes[locationId];

        let likeChange = 0;
        let dislikeChange = 0;

        if (previousVote === voteType) { // 取消投票
            userVotes[locationId] = null;
            voteType === 'like' ? likeChange = -1 : dislikeChange = -1;
        } else if (previousVote) { // 更改投票
            userVotes[locationId] = voteType;
            likeChange = voteType === 'like' ? 1 : -1;
            dislikeChange = voteType === 'dislike' ? 1 : -1;
        } else { // 新投票
            userVotes[locationId] = voteType;
            voteType === 'like' ? likeChange = 1 : dislikeChange = 1;
        }
        
        // localStorage.setItem('userBlacklistVotes', JSON.stringify(userVotes)); // 主模組處理
        
        // 更新 UI
        const $popup = $voteBtn.closest('.ol-popup');
        const newLikes = parseInt($popup.find('.likes-count').text()) + likeChange;
        const newDislikes = parseInt($popup.find('.dislikes-count').text()) + dislikeChange;
        $popup.find('.likes-count').text(newLikes);
        $popup.find('.dislikes-count').text(newDislikes);
        $popup.find('.score-display').text(newLikes - newDislikes);
        $popup.find('.vote-btn').removeClass('voted-like voted-dislike');
        if (userVotes[locationId] === 'like') $popup.find('.vote-btn[data-vote-type="like"]').addClass('voted-like');
        if (userVotes[locationId] === 'dislike') $popup.find('.vote-btn[data-vote-type="dislike"]').addClass('voted-dislike');

        // 發送 API 請求
        const reportsToUpdate = allFeatures.find(f => f.getId() === locationId)?.get('reports') || [];
        if(likeChange !== 0) sendVote(locationId, 'like', likeChange, reportsToUpdate);
        if(dislikeChange !== 0) sendVote(locationId, 'dislike', dislikeChange, reportsToUpdate);
    }
}

function handleMapClick(evt) {
    if ($('#app-container').hasClass('desktop-add-mode')) return;

    const clusterFeature = map.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: layer => layer === clusterLayer
    });

    if (clusterFeature) {
        const featuresInCluster = clusterFeature.get('features');
        if (featuresInCluster.length > 1) { 
            const extent = ol.extent.createEmpty();
            featuresInCluster.forEach(f => ol.extent.extend(extent, f.getGeometry().getExtent()));
            map.getView().fit(extent, { duration: 500, padding: [80, 80, 80, 80] });
        } else { 
            const originalFeature = featuresInCluster[0];
            const coordinates = originalFeature.getGeometry().getCoordinates();
            currentFeatureData = originalFeature.getProperties();
            
            const reportsByFullAddress = groupReportsByFullAddress(currentFeatureData.reports);
            
            if (reportsByFullAddress.size > 1) {
                renderUnitListPopup(currentFeatureData, reportsByFullAddress);
            } else {
                renderConsolidatedPopup(currentFeatureData, currentFeatureData.reports);
            }
            infoOverlay.setPosition(coordinates);
        }
    } else {
        infoOverlay.setPosition(undefined);
    }
}


// --- 輔助函式 ---

function formatAddress(address) {
    if (!address) return '';
    const match = address.match(/([^縣市區鄉鎮鎮]+(?:路|街|大道|巷|村|里).*)/);
    return match ? match[1] : address;
}

function groupReportsByFullAddress(reports) {
    const reportsByFullAddress = new Map();
    reports.forEach(report => {
        const fullAddr = report['地址'];
        if (!reportsByFullAddress.has(fullAddr)) {
            reportsByFullAddress.set(fullAddr, []);
        }
        reportsByFullAddress.get(fullAddr).push(report);
    });
    return reportsByFullAddress;
}

function extractAddressNumbers(address) {
    if (!address) return [Infinity];
    address = address.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 65248))
                     .replace(/地下/g, 'B')
                     .replace(/之/g, '.');
    const numbers = address.match(/B?\d+(\.\d+)?/g);
    if (!numbers) return [Infinity];
    return numbers.map(n => n.startsWith('B') ? -parseFloat(n.substring(1)) : parseFloat(n));
}

function compareAddresses(a, b) {
    const numsA = extractAddressNumbers(a);
    const numsB = extractAddressNumbers(b);
    const minLength = Math.min(numsA.length, numsB.length);
    for (let i = 0; i < minLength; i++) {
        if (numsA[i] !== numsB[i]) return numsA[i] - numsB[i];
    }
    return numsA.length - numsB.length;
}

