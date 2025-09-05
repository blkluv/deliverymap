import { state } from './state.js';
import * as api from './api.js';
import * as auth from './auth.js';
import * as grid from './grid.js';
import * as map from './map.js';
import { allCategories, categoryColors, APPS_SCRIPT_URL } from './config.js';

// --- 核心 UI 函式 ---

/**
 * 顯示通知訊息
 * @param {string} message - 訊息內容
 * @param {'info'|'success'|'warning'|'error'} type - 訊息類型
 */
export function showNotification(message, type = 'info') {
    const $notification = $('#notification');
    $notification.text(message).removeClass('hidden bg-blue-500 bg-green-500 bg-red-500 bg-yellow-500');
    const colorClass = { error: 'bg-red-500', success: 'bg-green-500', warning: 'bg-yellow-500' }[type] || 'bg-blue-500';
    $notification.addClass(colorClass);
    setTimeout(() => $notification.addClass('hidden'), 5000);
}

/**
 * 填充篩選器和圖例的內容
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
        $categorySelect.append(`<option value="${category}">${category}</option>`);
        $addCategorySelect.append($('<option>', { value: category, text: category }));
        if (map.legendIcons[category]) {
            $legendContent.append(`<div class="flex items-center"><img src="${map.legendIcons[category]}" class="h-4 w-4 mr-1.5">${category}</div>`);
        }
        $storeListFilters.append(`<button data-category="${category}" class="store-filter-btn text-nowrap bg-white text-black px-2 py-0.5 text-xs rounded-full mr-2 flex-shrink-0 border" style="border-color: ${categoryColors[category]};">${category}</button>`);
    });
}

/**
 * 應用篩選條件並更新地圖
 */
function applyFilters() {
    const category = $('#category-select').val();
    const keyword = $('#keyword-search').val();
    
    let results = state.allFeatures;
    if (keyword && state.fuse) {
        const pinyinKeyword = pinyinPro.pinyin(keyword, { pattern: 'pinyin', toneType: 'none', removeNonZh: true });
        results = state.fuse.search(pinyinKeyword).map(result => result.item);
    }
    const finalFeatures = results.filter(feature => (!category || feature.get('category') === category));
    
    state.vectorSource.clear();
    state.vectorSource.addFeatures(finalFeatures);
    updateStoreList();
    $('#filter-modal').addClass('hidden');
}

/**
 * 更新地圖可視範圍內的店家列表
 */
export function updateStoreList() {
    if (!state.map || !state.clusterSource) return;
    const extent = state.map.getView().calculateExtent(state.map.getSize());
    const $listContent = $('#store-list-content');
    const activeCategory = $('#store-list-filters .active').data('category');
    $listContent.html('');
    
    const uniqueFeatures = new Map();
    state.clusterSource.forEachFeatureInExtent(extent, cluster => {
        cluster.get('features').forEach(feature => {
            if (!uniqueFeatures.has(feature.getId())) {
                uniqueFeatures.set(feature.getId(), feature);
            }
        });
    });

    Array.from(uniqueFeatures.values()).forEach(feature => {
        const category = feature.get('category');
        if (!activeCategory || category === activeCategory) {
            const address = feature.get('address');
            const shortAddress = map.formatAddress(address);
            const color = categoryColors[category] || categoryColors['其他'];
            const listItem = $(`<div class="flex items-center text-sm py-1.5 px-2 cursor-pointer hover:bg-gray-200 rounded-md"><span class="h-2.5 w-2.5 rounded-full mr-2 flex-shrink-0" style="background-color: ${color}"></span><span class="truncate">${shortAddress}</span></div>`);
            listItem.on('click', () => {
                const coordinates = feature.getGeometry().getCoordinates();
                state.map.getView().animate({ center: coordinates, zoom: 18, duration: 800 }, () => {
                    displayPopupForFeature(feature);
                });
            });
            $listContent.append(listItem);
        }
    });
}

// --- Popup 渲染與互動 ---

/**
 * 為指定的 Feature 顯示 Popup
 * @param {ol.Feature} feature - 要顯示資訊的 Feature
 */
function displayPopupForFeature(feature) {
    const coordinates = feature.getGeometry().getCoordinates();
    state.currentFeatureData = feature.getProperties();
    
    const reportsByFullAddress = new Map();
    state.currentFeatureData.reports.forEach(report => {
        const fullAddr = report['地址'];
        if (!reportsByFullAddress.has(fullAddr)) reportsByFullAddress.set(fullAddr, []);
        reportsByFullAddress.get(fullAddr).push(report);
    });

    if (reportsByFullAddress.size > 1) {
        renderUnitListPopup(state.currentFeatureData, reportsByFullAddress);
    } else {
        renderConsolidatedPopup(state.currentFeatureData, state.currentFeatureData.reports);
    }
    state.infoOverlay.setPosition(coordinates);
}

function renderUnitListPopup(featureData, reportsByFullAddress) {
    const shortAddress = map.formatAddress(featureData.address);
    const sortedAddresses = Array.from(reportsByFullAddress.keys()).sort((a, b) => a.localeCompare(b, 'zh-Hant-TW-u-kn-true'));

    let listHtml = sortedAddresses.map(fullAddr => {
        const displayAddr = fullAddr.match(/(\d.*)/)?.[1]?.trim() || fullAddr;
        return `<li class="border-t py-2 px-1 cursor-pointer hover:bg-gray-100 rounded unit-item" data-address="${encodeURIComponent(fullAddr)}"><p class="font-semibold truncate" title="${fullAddr}">${displayAddr}</p></li>`;
    }).join('');

    $('#popup-content').html(`
        <h3 class="text-lg font-bold text-gray-800">${shortAddress}</h3>
        ${renderVoteSection(featureData)}
        <p class="text-sm text-gray-600 my-2 border-t pt-2">此地點有多筆回報，請選擇查看：</p>
        <ul class="text-sm max-h-40 overflow-y-auto custom-scrollbar pr-2">${listHtml}</ul>`);
}

function renderConsolidatedPopup(featureData, reports) {
    const shortAddress = map.formatAddress(reports[0]['地址']);
    let reportsHtml = reports.map(report => {
        const dateString = report.timestamp ? new Date(report.timestamp).toLocaleDateString('zh-TW') : '日期不明';
        return `
            <div class="border-t pt-2 mt-2">
                <p class="text-xs text-gray-500">${report.submitterName || '匿名'} &bull; ${dateString}</p>
                <p class="font-semibold">${report['黑名類別']}</p>
                <p class="whitespace-pre-wrap">${report['黑名原因'] || ''}</p>
            </div>`;
    }).join('');

    $('#popup-content').html(`
        <h3 class="text-lg font-bold text-gray-800">${shortAddress}</h3>
        ${renderVoteSection(featureData)}
        <div class="text-sm mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">${reportsHtml}</div>`);
}

function renderVoteSection(featureData) {
    const { likes = 0, dislikes = 0, address: locationId } = featureData;
    const score = likes - dislikes;
    const scoreColor = score > 0 ? 'text-green-600' : (score < 0 ? 'text-red-600' : 'text-gray-600');
    const userVote = state.userVotes[locationId];
    const likeClass = userVote === 'like' ? 'voted-like' : '';
    const dislikeClass = userVote === 'dislike' ? 'voted-dislike' : '';

    return `
        <div class="flex items-center justify-between text-sm mt-2">
            <span>總評分 (<span class="score-display ${scoreColor} font-bold">${score}</span>)</span>
            <div class="flex items-center space-x-2">
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${likeClass}" data-location-id="${locationId}" data-vote-type="like">
                    <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333V17a1 1 0 001 1h6.364a1 1 0 00.949-.684l2.121-6.364A1 1 0 0015.364 9H12V4a1 1 0 00-1-1h-1a1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.4 10.333zM6 8h2.545M5 10.5a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 013 0v3a1.5 1.5 0 01-1.5 1.5z"/></svg>
                </button>
                <span class="likes-count text-sm text-gray-600">${likes}</span>
                <button class="vote-btn p-1 rounded-full hover:bg-gray-200 ${dislikeClass}" data-location-id="${locationId}" data-vote-type="dislike">
                     <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667V3a1 1 0 00-1-1h-6.364a1 1 0 00-.949.684L3.565 9H6v7a1 1 0 001 1h1a1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.6-4.8zM14 12h-2.545M15 9.5a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-3 0v-3a1.5 1.5 0 011.5 1.5z"/></svg>
                </button>
                <span class="dislikes-count text-sm text-gray-600">${dislikes}</span>
            </div>
        </div>`;
}

function sendVote(locationId, voteType, change) {
    const feature = state.allFeatures.find(f => f.getId() === locationId);
    if (!feature) return;

    feature.get('reports').forEach(report => {
        const payload = { action: 'vote', rowIndex: report.rowIndex, voteType, change };
        fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) })
            .catch(error => console.error('Vote submission failed:', error));
    });
}

// --- 新增/編輯地點相關函式 ---

function handleFormSubmit(e) {
    e.preventDefault();
    const $form = $(e.target);
    const $submitBtn = $form.find('button[type="submit"]');
    const formData = new FormData($form[0]);
    
    const isArea = $form.find('#add-is-area').is(':checked');
    let finalCoords, areaBoundsStr = null;

    if (isArea) {
        if (state.selectedGridCells.size === 0) {
            return showNotification('請在地圖網格上至少選取一個區塊。', 'error');
        }
        areaBoundsStr = grid.compressGridData();
        finalCoords = state.lockedCenterForEditing || (state.isMobile ? state.tempMarker.getPosition() : state.map.getView().getCenter());
    } else {
        finalCoords = state.isMobile ? state.tempMarker?.getPosition() : state.map.getView().getCenter();
        if (!finalCoords) {
            return showNotification('請在地圖上設定一個位置。', 'error');
        }
    }
    
    $submitBtn.prop('disabled', true).find('.submit-text').addClass('hidden').end().find('.spinner').removeClass('hidden');
    
    const lonLat = ol.proj.toLonLat(finalCoords);
    const isAreaUpdate = !!formData.get('areaRowIndex');
    const isPointUpdate = !!formData.get('rowIndex');

    const newData = {
        action: isAreaUpdate ? 'user_update_area' : (isPointUpdate ? 'update' : 'create'),
        rowIndex: formData.get('areaRowIndex') || formData.get('rowIndex'),
        originalName: formData.get('originalName'),
        userEmail: state.userProfile.email,
        lineUserId: state.userProfile.lineUserId,
        submitterName: state.currentUserDisplayName || 'N/A',
        name: formData.get('address'),
        areaName: formData.get('areaName'),
        address: formData.get('address'),
        lon: lonLat[0], lat: lonLat[1],
        timestamp: new Date().toISOString(),
        areaBounds: areaBoundsStr,
        category: formData.get('category'),
        blacklistCategory: formData.get('blacklistCategory'),
        blacklistReason: formData.get('blacklistReason').trim(),
    };

    fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(newData) })
        .then(res => res.json())
        .then(result => {
            if (result.status === 'success') {
                showNotification("資料已成功送出！感謝您的貢獻。", 'success');
                exitAddMode();
                setTimeout(() => api.loadData(), 2000);
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        }).catch(error => {
            showNotification(`送出失敗: ${error.message}`, 'error');
        }).finally(() => {
            $submitBtn.prop('disabled', false).find('.submit-text').removeClass('hidden').end().find('.spinner').addClass('hidden');
        });
}

function enterDesktopAddMode(coordinate) {
    state.initialAddLocationCoords = coordinate;
    $('#app-container').addClass('desktop-add-mode');
    $('#desktop-center-marker').removeClass('hidden');
    setTimeout(() => {
        state.map.updateSize();
        state.map.getView().animate({ center: coordinate, zoom: 17, duration: 500 }, () => {
            const centerLonLat = ol.proj.toLonLat(state.map.getView().getCenter());
            api.reverseGeocode(centerLonLat[0], centerLonLat[1]);
        });
    }, 350);
    state.map.on('moveend', handleDesktopMapMove);
}

function enterMobilePlacementMode(coordinate) {
    if(state.tempMarker) state.map.removeOverlay(state.tempMarker);
    const markerEl = document.createElement('div');
    markerEl.className = 'new-location-marker';
    state.tempMarker = new ol.Overlay({ element: markerEl, position: coordinate, positioning: 'bottom-center', stopEvent: false });
    state.map.addOverlay(state.tempMarker);
    state.map.getView().animate({ center: coordinate, zoom: 18, duration: 500 });
    
    markerEl.addEventListener('pointerdown', (e) => {
        if ($('#mobile-add-area-tab').hasClass('active')) return;
        state.isDraggingMarker = true;
        state.dragPanInteraction.setActive(false);
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp, { once: true });
        e.stopPropagation();
    });
}

function exitAddMode() {
    if (state.isAreaSelectionMode) grid.toggleAreaSelectionMode(false);
    
    if (state.isMobile) {
        if(state.tempMarker) state.map.removeOverlay(state.tempMarker);
        state.tempMarker = null;
        $('#add-location-modal-mobile').addClass('hidden').removeClass('minimized');
        $('#restore-mobile-modal-btn').addClass('hidden');
    } else {
        $('#app-container').removeClass('desktop-add-mode');
        $('#desktop-center-marker').addClass('hidden');
        state.map.un('moveend', handleDesktopMapMove);
        setTimeout(() => state.map.updateSize(), 350);
    }
    $('#add-is-area').prop('checked', false);
    $('#edit-row-index, #edit-area-row-index, #edit-original-name').val('');
    api.loadData();
}

// --- 管理與審核 Modal ---

function loadUserLocations() {
    const $listContent = $('#management-list-content').html('');
    if (!state.isLoggedIn) return $listContent.html('<p class="text-gray-500">請先登入。</p>');

    const userSubmissions = state.rawReports.filter(r => !r.isCommunity && (r.submitterEmail === state.userProfile.email || r.lineUserId === state.userProfile.lineUserId));

    if (userSubmissions.length === 0) return $listContent.html('<p class="text-gray-500">您尚未提交任何地點資料。</p>');

    userSubmissions.forEach(report => {
        const status = String(report['審核']).toUpperCase() === 'TRUE' ? '<span class="text-green-600 font-semibold">已通過</span>' : '<span class="text-yellow-600 font-semibold">待審核</span>';
        $listContent.append(`
            <div class="border-b py-3 flex justify-between items-center">
                <div>
                    <p class="font-semibold">${report['地址']}</p>
                    <p class="text-sm text-gray-600">${report['黑名類別']} - ${report['黑名原因']}</p>
                    <p class="text-xs text-gray-500 mt-1">狀態: ${status}</p>
                </div>
                <div>
                    <button class="edit-store-btn text-sm text-blue-600 hover:underline mr-4" data-row-index="${report.rowIndex}">修改</button>
                    <button class="delete-store-btn text-sm text-red-600 hover:underline" data-row-index="${report.rowIndex}">刪除</button>
                </div>
            </div>`);
    });
}

function loadUserAreas() {
    const $content = $('#management-area-content').html('');
    if (!state.isLoggedIn) return $content.html('<p class="text-gray-500">請先登入。</p>');
    
    Object.values(state.managementAreaMaps).forEach(map => map?.setTarget(null));
    state.managementAreaMaps = {};

    const userAreas = state.rawReports.filter(r => r.isCommunity && (r.submitterEmail === state.userProfile.email || r.lineUserId === state.userProfile.lineUserId));

    if (userAreas.length === 0) return $content.html('<p class="text-gray-500">您尚未提交任何建築資料。</p>');

    userAreas.forEach(area => {
        const statusKey = String(area['審核']).toUpperCase();
        const status = statusKey === 'TRUE' ? '<span class="text-green-600 font-semibold">已通過</span>' : (statusKey === 'REJECT' ? '<span class="text-red-600 font-semibold">已駁回</span>' : '<span class="text-yellow-600 font-semibold">待審核</span>');
        const mapId = `management-map-${area.rowIndex}`;
        $content.append(`
            <div class="border rounded-lg p-4 mb-4 flex items-center space-x-4">
                <div id="${mapId}" class="w-24 h-24 bg-gray-100 rounded border border-gray-300 flex-shrink-0"></div>
                <div class="flex-grow">
                    <h4 class="font-bold text-lg">${area.areaName || '未命名社區'}</h4>
                    <p class="text-sm text-gray-600">${area['地址'] || '...'}</p>
                    <div class="mt-2">狀態: ${status}</div>
                </div>
                <div class="flex flex-col space-y-2">
                    <button class="edit-area-btn bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-sm" data-row-index="${area.rowIndex}">修改</button>
                    <button class="delete-store-btn bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm" data-row-index="${area.rowIndex}">刪除</button>
                </div>
            </div>`);
        
        setTimeout(() => {
           state.managementAreaMaps[area.rowIndex] = map.renderAreaOnMap(mapId, area.areaBounds);
        }, 0);
    });
}

function openEditModalForUser(report) {
    const isAreaEdit = !!report.isCommunity;
    
    ['#add-location-form', '#add-location-form-mobile'].forEach(formId => {
        const $form = $(formId);
        $form[0].reset();
        $form.find('#edit-row-index').val(isAreaEdit ? '' : report.rowIndex);
        $form.find('#edit-area-row-index').val(isAreaEdit ? report.rowIndex : '');
        $form.find('#edit-original-name').val(report['地址']);
        $form.find('#add-address').val(report['地址']);
        $form.find('#add-area-name').val(report['areaName'] || '');
        $form.find('#add-category').val(report['分類']);
        $form.find('#add-blacklist-category').val(report['黑名類別']);
        $form.find('#add-blacklist-reason').val(report['黑名原因']);
    });
    
    $('#modal-title').text(isAreaEdit ? '修改建築' : '修改地點');
    $('#management-modal').addClass('hidden');
    
    const coordinate = ol.proj.fromLonLat([parseFloat(report['經度']), parseFloat(report['緯度'])]);
    
    if (state.isMobile) {
        enterMobilePlacementMode(coordinate);
        $('#add-location-modal-mobile').removeClass('hidden');
    } else {
        enterDesktopAddMode(coordinate);
    }
}

function loadReviewData(status = 'pending') {
    const $listPanel = $('#review-list-panel').html('');
    const $detailPanel = $('#review-detail-panel').html('<p class="text-gray-500">請從左側列表選擇。</p>');

    const reportsToReview = state.rawReports.filter(report => {
        const currentStatus = String(report['審核']).toUpperCase();
        return status === 'pending'
            ? (currentStatus !== 'TRUE' && currentStatus !== 'REJECT')
            : (currentStatus === 'TRUE' || currentStatus === 'REJECT');
    });

    if (reportsToReview.length === 0) return $listPanel.html(`<p class="p-4 text-sm text-gray-500">沒有項目。</p>`);

    reportsToReview.forEach(report => {
        $listPanel.append(`
            <div class="p-4 border-b cursor-pointer hover:bg-gray-100 review-item" data-row-index="${report.rowIndex}" data-is-community="${!!report.isCommunity}">
                <p class="font-semibold text-gray-800">${report.areaName || report['地址']}</p>
                <p class="text-sm text-gray-600 truncate">${report['黑名原因'] || '社區項目'}</p>
                <p class="text-xs text-gray-400 mt-1">提交者: ${report.submitterEmail || 'N/A'}</p>
            </div>`);
    });
}

function displayReviewDetails(report) {
    const $detailPanel = $('#review-detail-panel');
    const submissionDate = new Date(report.timestamp || 0).toLocaleString('zh-TW');
    const isCommunity = !!report.isCommunity;
    
    let detailHtml = `
        <div class="space-y-3 text-sm">
            <h3 class="text-xl font-bold text-gray-900">${report.areaName || report['地址']}</h3>
            ${isCommunity ? '' : `<p class="font-semibold" style="color: ${categoryColors[report['分類']] || '#ccc'}">${report['分類']}</p>`}
            <hr>
            ${isCommunity ? '' : `<p><strong>黑名類別:</strong> ${report['黑名類別']}</p><p><strong>原因:</strong></p><p class="whitespace-pre-wrap bg-gray-50 p-2 rounded">${report['黑名原因']}</p><hr>`}
            <p><strong>座標:</strong> ${parseFloat(report['經度']).toFixed(5)}, ${parseFloat(report['緯度']).toFixed(5)}</p>
            <p><strong>提交者:</strong> ${report.submitterName || 'N/A'} (${report.submitterEmail || 'N/A'})</p>
            <p><strong>時間:</strong> ${submissionDate}</p>
            <p><strong>Row Index:</strong> ${report.rowIndex}</p>
        </div>
        <div class="mt-6 flex space-x-4">
            <button class="admin-action-btn flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700" data-action="approve">通過</button>
            <button class="admin-action-btn flex-1 bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700" data-action="reject">駁回</button>
            ${isCommunity ? '' : `<button class="admin-action-btn flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700" data-action="delete">刪除</button>`}
        </div>`;

    if (isCommunity) {
        detailHtml = `<div id="review-map-container" class="relative w-full h-64 bg-gray-200 mb-4 rounded-lg overflow-hidden"><div id="review-map" class="w-full h-full"></div></div>` + detailHtml;
    }
    
    $detailPanel.html(detailHtml).data({ rowIndex: report.rowIndex, isCommunity });
    if (isCommunity) setTimeout(() => map.renderAreaOnMap('review-map', report.areaBounds), 0);
}

function sendAdminAction(action, rowIndex, isCommunity) {
    showNotification(`正在 ${action}...`);
    fetch(APPS_SCRIPT_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'text/plain' }, 
        body: JSON.stringify({ action, rowIndex, isCommunity, adminEmail: state.userProfile.email }) 
    })
    .then(res => res.json())
    .then(result => {
        if (result.status === 'success') {
             showNotification("操作成功！", 'success');
             $('#review-refresh-btn').click();
        } else throw new Error(result.message);
    }).catch(error => showNotification(`操作失敗: ${error.message}`, 'error'));
}

function handleContextMenu(element, x, y) {
    const $el = $(element);
    const userId = $el.data('user-id');
    const userName = $el.data('user-name');

    if (!userId || userId === (state.userProfile.email || state.userProfile.lineUserId)) return;
    
    state.contextMenuTarget = { userId, userName };
    
    $('#context-mute-user').toggle(state.isAdmin);
    $('#chat-context-menu').css({ top: `${y}px`, left: `${x}px` }).removeClass('hidden');
}


// --- 事件處理函式 ---

const handleDesktopMapMove = () => api.reverseGeocode(...ol.proj.toLonLat(state.map.getView().getCenter()));
const handlePointerMove = (e) => { if(state.isDraggingMarker) state.tempMarker.setPosition(state.map.getEventCoordinate(e)); };
const handlePointerUp = () => {
    if(state.isDraggingMarker) {
        state.isDraggingMarker = false;
        state.dragPanInteraction.setActive(true);
        document.removeEventListener('pointermove', handlePointerMove);
        api.reverseGeocode(...ol.proj.toLonLat(state.tempMarker.getPosition()), $('#add-location-form-mobile'));
    }
};

const handleMapClick = (evt) => {
    if (state.isAreaSelectionMode || $('#app-container').hasClass('desktop-add-mode')) return;
    
    let featureClicked = false;
    state.map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        if (featureClicked) return;
        const clusterFeatures = feature.get('features');
        if (clusterFeatures) {
            featureClicked = true;
            if (clusterFeatures.length > 1) {
                const extent = ol.extent.createEmpty();
                clusterFeatures.forEach(f => ol.extent.extend(extent, f.getGeometry().getExtent()));
                state.map.getView().fit(extent, { duration: 500, padding: [80, 80, 80, 80] });
            } else {
                displayPopupForFeature(clusterFeatures[0]);
            }
        }
    }, { hitTolerance: 5 });

    if (!featureClicked) state.infoOverlay.setPosition(undefined);
};

/**
 * 初始化所有 UI 事件監聽器
 */
export function initializeUI() {
    // --- 主按鈕與面板 ---
    $('#add-location-btn').on('click', () => {
        if (!state.isLoggedIn) return showNotification('請先登入才能新增地點！', 'warning');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const mapCoords = ol.proj.fromLonLat([pos.coords.longitude, pos.coords.latitude]);
                const action = state.isMobile ? enterMobilePlacementMode : enterDesktopAddMode;
                action(mapCoords);
                 if (state.isMobile) {
                    $('#add-location-modal-mobile').removeClass('hidden');
                     const lonLat = ol.proj.toLonLat(mapCoords);
                    api.reverseGeocode(lonLat[0], lonLat[1], $('#add-location-form-mobile'));
                }
            },
            () => {
                showNotification('無法取得您的位置，請手動選擇。', 'warning');
                const centerCoords = state.map.getView().getCenter();
                const action = state.isMobile ? enterMobilePlacementMode : enterDesktopAddMode;
                action(centerCoords);
                 if (state.isMobile) $('#add-location-modal-mobile').removeClass('hidden');
            }
        );
    });
    $('#search-address-btn').on('click', () => $('#search-panel').toggleClass('hidden'));
    $('#open-filter-modal').on('click', () => $('#filter-modal').removeClass('hidden'));
    $('#center-on-me-btn').on('click', () => state.userPositionCoords && state.map.getView().animate({ center: state.userPositionCoords, zoom: 16 }));
    $('#open-chat-btn').on('click', () => { $('#chat-modal').removeClass('hidden'); state.unreadChatCount = 0; $('#chat-unread-badge').addClass('hidden').text(''); });
    
    // --- 各種 Modal 的關閉與操作 ---
    $(document).on('click', '#close-add-location-modal, #close-add-location-modal-mobile, #close-filter-modal, #close-management-modal, #close-review-modal, #close-chat-modal, #cancel-mute-btn', function() {
        $(this).closest('.fixed.inset-0').addClass('hidden');
    });
    $('#popup-closer').on('click', (e) => { e.preventDefault(); state.infoOverlay.setPosition(undefined); });
    $('#filter-btn').on('click', applyFilters);
    $('#reset-btn').on('click', () => { $('#category-select, #keyword-search').val(''); applyFilters(); });

    // --- 表單提交 ---
    $('#add-location-form, #add-location-form-mobile').on('submit', handleFormSubmit);
    $('#mute-user-form').on('submit', (e) => {
        e.preventDefault();
        const days = parseInt($('#mute-days').val(), 10) || 0;
        const minutes = parseInt($('#mute-minutes').val(), 10) || 0;
        if (days === 0 && minutes === 0) return showNotification('請設定有效的禁言時間。', 'warning');

        showNotification(`正在禁言 ${state.contextMenuTarget.userName}...`, 'info');
        fetch(APPS_SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'muteUser',
                adminEmail: state.userProfile.email,
                targetUserId: state.contextMenuTarget.userId,
                targetUserName: state.contextMenuTarget.userName,
                duration: `${days}d${minutes}m`
            })
        })
        .then(res => res.json())
        .then(result => {
            if (result.status === 'success') {
                showNotification(`${state.contextMenuTarget.userName} 已被禁言。`, 'success');
                $('#mute-user-modal').addClass('hidden');
            } else { throw new Error(result.message); }
        })
        .catch(error => showNotification(`禁言失敗: ${error.message}`, 'error'));
    });
    
    // --- 地圖與列表互動 ---
    state.map.on('singleclick', handleMapClick);
    state.map.on('moveend', updateStoreList);
    $('#store-list-filters').on('click', '.store-filter-btn', function() {
        $('.store-filter-btn').removeClass('active bg-blue-600 text-white').addClass('text-black bg-white');
        $(this).addClass('active bg-blue-600 text-white');
        updateStoreList();
    });
    
    // --- Popup 內部點擊 (事件委派) ---
    $('#popup').on('click', (e) => {
        const $target = $(e.target);
        const $voteBtn = $target.closest('.vote-btn');
        const $unitItem = $target.closest('.unit-item');

        if ($voteBtn.length) {
            if (!state.isLoggedIn) return showNotification('請先登入才能評分！', 'warning');
            
            const locationId = $voteBtn.data('location-id');
            const voteType = $voteBtn.data('vote-type');
            const previousVote = state.userVotes[locationId];
            let likeChange = 0, dislikeChange = 0;

            if (previousVote === voteType) { // 取消投票
                state.userVotes[locationId] = null;
                voteType === 'like' ? likeChange = -1 : dislikeChange = -1;
            } else { // 新增或變更投票
                if (previousVote) { voteType === 'like' ? dislikeChange = -1 : likeChange = -1; }
                state.userVotes[locationId] = voteType;
                voteType === 'like' ? likeChange += 1 : dislikeChange += 1;
            }
            auth.saveUserVotes();
            
            // Update UI immediately
            const $popup = $voteBtn.closest('.ol-popup');
            const newLikes = parseInt($popup.find('.likes-count').text()) + likeChange;
            const newDislikes = parseInt($popup.find('.dislikes-count').text()) + dislikeChange;
            $popup.find('.likes-count').text(newLikes);
            $popup.find('.dislikes-count').text(newDislikes);
            $popup.find('.score-display').text(newLikes - newDislikes);
            $popup.find('.vote-btn').removeClass('voted-like voted-dislike');
            if(state.userVotes[locationId]) $popup.find(`.vote-btn[data-vote-type="${state.userVotes[locationId]}"]`).addClass(`voted-${state.userVotes[locationId]}`);

            if(likeChange !== 0) sendVote(locationId, 'like', likeChange);
            if(dislikeChange !== 0) sendVote(locationId, 'dislike', dislikeChange);
        }
        if ($unitItem.length) {
            const fullAddress = decodeURIComponent($unitItem.data('address'));
            const reports = state.currentFeatureData.reports.filter(r => r['地址'] === fullAddress);
            renderConsolidatedPopup(state.currentFeatureData, reports);
        }
    });

    // --- 管理與審核 (事件委派) ---
    $('#manage-btn').on('click', () => { $('#management-modal').removeClass('hidden'); $('#manage-locations-tab').click(); });
    $('#review-btn').on('click', async () => { await api.loadData(); $('#review-modal').removeClass('hidden'); loadReviewData('pending'); });
    $('#review-refresh-btn').on('click', async () => { await api.loadData(); loadReviewData($('#pending-tab').hasClass('border-indigo-500') ? 'pending' : 'approved'); });
    
    $('.nav-tab').on('click', function() {
        const $this = $(this);
        $this.siblings().removeClass('border-indigo-500 text-indigo-600').addClass('border-transparent text-gray-500');
        $this.addClass('border-indigo-500 text-indigo-600').removeClass('border-transparent text-gray-500');

        if($this.is('#manage-locations-tab')) { loadUserLocations(); $('#management-list-content').removeClass('hidden'); $('#management-area-content').addClass('hidden'); }
        if($this.is('#manage-areas-tab')) { loadUserAreas(); $('#management-area-content').removeClass('hidden'); $('#management-list-content').addClass('hidden'); }
        if($this.is('#pending-tab')) { loadReviewData('pending'); }
        if($this.is('#approved-tab')) { loadReviewData('approved'); }
    });

    $('#management-list-content, #management-area-content').on('click', '.edit-store-btn, .edit-area-btn', function() {
        const rowIndex = $(this).data('row-index');
        const isArea = $(this).hasClass('edit-area-btn');
        const report = state.rawReports.find(r => r.rowIndex == rowIndex && !!r.isCommunity === isArea);
        if (report) openEditModalForUser(report);
    });

    $('#management-list-content, #management-area-content').on('click', '.delete-store-btn', function() {
        if (!confirm('確定要刪除這筆您提交的資料嗎？')) return;
        const rowIndex = $(this).data('row-index');
        showNotification('正在刪除...');
        fetch(APPS_SCRIPT_URL, { 
            method: 'POST', mode: 'no-cors', 
            body: JSON.stringify({ action: 'user_delete', rowIndex, userEmail: state.userProfile.email, lineUserId: state.userProfile.lineUserId })
        })
        .then(() => { showNotification("資料已刪除！", 'success'); api.loadData(); $('#management-modal').addClass('hidden'); })
        .catch(() => showNotification('刪除失敗。', 'error'));
    });
    
    $('#review-list-panel').on('click', '.review-item', function() {
        $('.review-item').removeClass('bg-indigo-50');
        $(this).addClass('bg-indigo-50');
        const rowIndex = $(this).data('row-index');
        const isCommunity = $(this).data('is-community');
        const report = state.rawReports.find(r => r.rowIndex == rowIndex && !!r.isCommunity === isCommunity);
        if (report) displayReviewDetails(report);
    });

    $('#review-detail-panel').on('click', '.admin-action-btn', function() {
        const { rowIndex, isCommunity } = $('#review-detail-panel').data();
        const action = $(this).data('action');
        if (action === 'delete' && !confirm('確定要永久刪除這筆資料嗎？')) return;
        sendAdminAction(action, rowIndex, isCommunity);
    });

    // --- 聊天室 ---
    let longPressTimer;
    $('#chat-messages').on('contextmenu', '.chat-message-item', function(e) {
        e.preventDefault();
        handleContextMenu(this, e.pageX, e.pageY);
    }).on('touchstart', '.chat-message-item', function(e) {
        const target = this;
        longPressTimer = setTimeout(() => {
            handleContextMenu(target, e.touches[0].pageX, e.touches[0].pageY);
        }, 500);
    }).on('touchend touchmove', () => clearTimeout(longPressTimer));

    $('#context-mute-user').on('click', (e) => { 
        e.preventDefault(); 
        $('#chat-context-menu').addClass('hidden');
        $('#mute-user-name').text(state.contextMenuTarget.userName);
        $('#mute-user-modal').removeClass('hidden'); 
    });
}

