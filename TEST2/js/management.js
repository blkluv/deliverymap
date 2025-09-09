/**
 * @file 處理「我的貢獻管理」和「管理員審核」面板的邏輯。
 */
import { showNotification } from './ui.js';
import * as api from './api.js';
import { getLoginStatus, getUserProfile } from './auth.js';
import { enterMobilePlacementMode, enterDesktopAddMode } from './add-location.js';
import { categoryColors } from './config.js';

// --- 模組內部狀態 ---
let rawReports = [];
let reviewMapInstance = null; // 審核面板中的地圖實例
let managementAreaMaps = {};  // 管理面板中的多個地圖實例
const isMobile = window.innerWidth < 768;


/**
 * 從主模組設定原始報告資料 (用於首次載入)。
 * @param {Array} reports - 所有的地點/區域報告。
 */
export function setRawReports(reports) {
    rawReports = reports;
}

/**
 * 設置管理面板和審核面板的所有事件監聽器。
 */
export function setupManagementListeners() {
    // --- 我的貢獻管理 Modal ---
    $('#manage-btn').on('click', openManagementModal);
    $('#close-management-modal').on('click', closeManagementModal);
    $('#manage-locations-tab').on('click', () => switchManagementTab('locations'));
    $('#manage-areas-tab').on('click', () => switchManagementTab('areas'));

    // --- 管理員審核 Modal ---
    $('#review-btn').on('click', openReviewModal);
    $('#close-review-modal').on('click', closeReviewModal);
    $('#pending-tab').on('click', () => switchReviewTab('pending'));
    $('#approved-tab').on('click', () => switchReviewTab('approved'));
    $('#review-refresh-btn').on('click', () => {
        document.dispatchEvent(new CustomEvent('refresh-data', { detail: { source: 'review' } }));
    });

    // --- 事件代理 ---
    $('#management-list-content, #management-area-content').on('click', '.edit-btn', handleEditClick);
    $('#management-list-content, #management-area-content').on('click', '.delete-btn', handleDeleteClick);
    
    $('#review-list-panel').on('click', '.review-item', handleReviewItemClick);
    $('#review-detail-panel').on('click', '.admin-action-btn', handleAdminActionClick);
}

// --- 我的貢獻 Modal ---

async function openManagementModal() {
    $('#management-modal').removeClass('hidden');
    // 顯示載入指示器
    $('#management-list-content, #management-area-content').html('<div class="flex justify-center items-center p-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>');
    
    try {
        // 1. 自動重新獲取最新資料
        const latestReports = await api.loadData();
        // 2. 更新模組內部的資料來源
        rawReports = latestReports;
        // 3. 使用最新資料渲染介面
        switchManagementTab('locations');
    } catch (error) {
        console.error("無法為管理面板更新資料:", error);
        showNotification('無法更新資料，請稍後再試', 'error');
        $('#management-list-content').html('<p class="text-red-500 text-center">無法載入您的貢獻資料。</p>');
        $('#management-area-content').addClass('hidden');
    }
}

function closeManagementModal() {
    $('#management-modal').addClass('hidden');
    Object.values(managementAreaMaps).forEach(map => map?.setTarget(null));
    managementAreaMaps = {};
}

function switchManagementTab(tab) {
    const isLocations = tab === 'locations';
    $('#manage-locations-tab').toggleClass('border-indigo-500 text-indigo-600', isLocations).toggleClass('border-transparent text-gray-500', !isLocations);
    $('#manage-areas-tab').toggleClass('border-indigo-500 text-indigo-600', !isLocations).toggleClass('border-transparent text-gray-500', isLocations);
    $('#management-list-content').toggleClass('hidden', !isLocations);
    $('#management-area-content').toggleClass('hidden', isLocations);
    isLocations ? loadUserLocations() : loadUserAreas();
}

function loadUserLocations() {
    const $content = $('#management-list-content').empty();
    const profile = getUserProfile();
    if (!getLoginStatus()) {
        $content.html('<p class="text-gray-500">請先登入。</p>');
        return;
    }

    const currentUserIdentifier = profile.email || profile.lineUserId;
    if (!currentUserIdentifier) {
        $content.html('<p class="text-gray-500">無法識別您的使用者身份。</p>');
        return;
    }

    const submissions = rawReports.filter(r => 
        !r.isCommunity && (r.submitterEmail === currentUserIdentifier)
    );

    if (submissions.length === 0) {
        $content.html('<p class="text-gray-500">您尚未提交任何地點資料。</p>');
        return;
    }

    submissions.forEach(report => {
        $content.append(`
            <div class="border-b py-3 flex justify-between items-center">
                <div>
                    <p class="font-semibold">${report['地址']}</p>
                    <p class="text-sm text-gray-600">${report['黑名類別']} - ${report['黑名原因']}</p>
                    <p class="text-xs text-gray-500 mt-1">狀態: ${getStatusBadge(report['審核'])}</p>
                </div>
                <div>
                    <button class="edit-btn text-sm text-blue-600 hover:underline mr-4" data-row-index="${report.rowIndex}" data-is-community="false">修改</button>
                    <button class="delete-btn text-sm text-red-600 hover:underline" data-row-index="${report.rowIndex}" data-is-community="false">刪除</button>
                </div>
            </div>
        `);
    });
}

async function loadUserAreas() {
    const $content = $('#management-area-content').empty();
    Object.values(managementAreaMaps).forEach(map => map?.setTarget(null));
    managementAreaMaps = {};
    
    const profile = getUserProfile();
    if (!getLoginStatus()) {
        $content.html('<p class="text-gray-500">請先登入。</p>');
        return;
    }
    
    const currentUserIdentifier = profile.email || profile.lineUserId;
    if (!currentUserIdentifier) {
        $content.html('<p class="text-gray-500">無法識別您的使用者身份。</p>');
        return;
    }

    const submissions = rawReports.filter(r => 
        r.isCommunity && (r['製作者'] === currentUserIdentifier)
    );

    if (submissions.length === 0) {
        $content.html('<p class="text-gray-500">您尚未提交任何建築資料。</p>');
        return;
    }

    for (const area of submissions) {
        const mapId = `mgmt-map-${area.rowIndex}`, addressId = `mgmt-addr-${area.rowIndex}`;
        $content.append(`
            <div class="border rounded-lg p-4 mb-4 flex items-center space-x-4">
                <div id="${mapId}" class="w-24 h-24 bg-gray-100 rounded border flex-shrink-0"></div>
                <div class="flex-grow">
                    <h4 class="font-bold text-lg">${area.areaName || '未命名'}</h4>
                    <p id="${addressId}" class="text-sm text-gray-600">${area['地址'] || '...'}</p>
                    <div class="mt-2">狀態: ${getStatusBadge(area['審核'])}</div>
                </div>
                <div class="flex flex-col space-y-2">
                    <button class="edit-btn text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600" data-row-index="${area.rowIndex}" data-is-community="true">修改</button>
                    <button class="delete-btn text-sm bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600" data-row-index="${area.rowIndex}" data-is-community="true">刪除</button>
                </div>
            </div>
        `);
        
        if (!area['地址'] && area.areaBounds) {
             try {
                const { o: [lon, lat] } = JSON.parse(area.areaBounds);
                const address = await api.getAddressFromCoords(parseFloat(lon), parseFloat(lat));
                $(`#${addressId}`).text(address);
            } catch(e) { console.error(e); }
        }
        
        setTimeout(() => managementAreaMaps[area.rowIndex] = renderAreaOnMap(mapId, area.areaBounds), 0);
    }
}

// --- 管理員審核 Modal ---

function openReviewModal() {
    $('#review-modal').removeClass('hidden');
    switchReviewTab('pending');
}

function closeReviewModal() {
    $('#review-modal').addClass('hidden');
    if (reviewMapInstance) reviewMapInstance.setTarget(null), reviewMapInstance = null;
}

function switchReviewTab(tab) {
    const isPending = tab === 'pending';
    $('#pending-tab').toggleClass('border-indigo-500 text-indigo-600', isPending).toggleClass('border-transparent text-gray-500', !isPending);
    $('#approved-tab').toggleClass('border-indigo-500 text-indigo-600', !isPending).toggleClass('border-transparent text-gray-500', isPending);
    loadReviewData(tab);
}

export function loadReviewData(status = 'pending') {
    const $listPanel = $('#review-list-panel').empty();
    $('#review-detail-panel').html('<p class="text-gray-500">請從左側列表選擇一個項目。</p>');

    const reports = rawReports.filter(r => {
        const s = String(r['審核']).toUpperCase();
        return status === 'pending' ? (s !== 'TRUE' && s !== 'REJECT') : (s === 'TRUE' || s === 'REJECT');
    });

    if (reports.length === 0) {
        $listPanel.html(`<p class="p-4 text-sm text-gray-500">沒有${status === 'pending' ? '待審核' : '已處理'}的項目。</p>`);
        return;
    }

    reports.forEach(r => $listPanel.append(`
        <div class="p-4 border-b cursor-pointer hover:bg-gray-100 review-item" data-row-index="${r.rowIndex}" data-is-community="${!!r.isCommunity}">
            <p class="font-semibold">${r.areaName || r['地址']}</p>
            <p class="text-sm text-gray-600 truncate">${r['黑名原因'] || '社區/建築'}</p>
            <p class="text-xs text-gray-400 mt-1">${r.submitterEmail || 'N/A'}</p>
        </div>
    `));
}

function displayReviewDetails(report) {
    const $detail = $('#review-detail-panel').empty();
    const date = report.timestamp ? new Date(report.timestamp).toLocaleString('zh-TW') : '不明';

    if (report.isCommunity) {
        $detail.html(`
            <div class="w-full h-64 bg-gray-200 mb-4 rounded-lg"><div id="review-map" class="w-full h-full"></div></div>
            <div class="space-y-2 text-sm">
                <h3 class="text-xl font-bold">${report.areaName || '未命名'}</h3><hr>
                <p><strong>座標:</strong> ${parseFloat(report['經度']).toFixed(5)}, ${parseFloat(report['緯度']).toFixed(5)}</p>
                <p><strong>提交者:</strong> ${report.submitterEmail || 'N/A'}</p>
                <p><strong>時間:</strong> ${date}</p>
                <p><strong>Row:</strong> ${report.rowIndex}</p>
            </div>
            <div class="mt-6 flex space-x-4">
                <button class="admin-action-btn flex-1 bg-green-600 text-white py-2 rounded" data-action="approve">通過</button>
                <button class="admin-action-btn flex-1 bg-yellow-600 text-white py-2 rounded" data-action="reject">駁回</button>
            </div>
        `);
        setTimeout(() => {
            if (reviewMapInstance) reviewMapInstance.setTarget(null);
            reviewMapInstance = renderAreaOnMap('review-map', report.areaBounds);
        }, 0);
    } else {
        $detail.html(`
            <div class="space-y-3 text-sm">
                <h3 class="text-xl font-bold">${report['地址']}</h3>
                <p class="font-semibold" style="color: ${categoryColors[report['分類']] || '#ccc'}">${report['分類']}</p><hr>
                <p><strong>黑名類別:</strong> ${report['黑名類別']}</p>
                <p><strong>黑名原因:</strong></p>
                <p class="whitespace-pre-wrap bg-gray-50 p-2 rounded">${report['黑名原因']}</p><hr>
                <p><strong>座標:</strong> ${parseFloat(report['經度']).toFixed(5)}, ${parseFloat(report['緯度']).toFixed(5)}</p>
                <p><strong>提交者:</strong> ${report.submitterEmail || 'N/A'}</p>
                <p><strong>時間:</strong> ${date}</p>
                <p><strong>Row:</strong> ${report.rowIndex}</p>
            </div>
            <div class="mt-6 flex space-x-4">
                <button class="admin-action-btn flex-1 bg-green-600 text-white py-2 rounded" data-action="approve">通過</button>
                <button class="admin-action-btn flex-1 bg-yellow-600 text-white py-2 rounded" data-action="reject">駁回</button>
                <button class="admin-action-btn flex-1 bg-red-600 text-white py-2 rounded" data-action="delete">刪除</button>
            </div>
        `);
    }
    $detail.data('report', report);
}

// --- 事件處理輔助函式 ---

async function handleEditClick() {
    const rowIndex = $(this).data('row-index'), isCommunity = $(this).data('is-community');
    const report = rawReports.find(r => r.rowIndex == rowIndex && !!r.isCommunity === isCommunity);
    if (report) openEditModalForUser(report);
    else showNotification('找不到資料。', 'error');
}

async function handleDeleteClick() {
    const rowIndex = $(this).data('row-index');
    const isCommunity = $(this).data('is-community');
    const profile = getUserProfile();
    
    if (confirm('確定要刪除這筆您提交的資料嗎？')) {
        showNotification('正在刪除...');
        try {
            const result = await api.userDelete(rowIndex, isCommunity, profile);
             if (result.status === 'success') {
                showNotification("資料已刪除！", 'success');
                closeManagementModal();
                document.dispatchEvent(new CustomEvent('refresh-data'));
            } else {
                throw new Error(result.message || '刪除失敗');
            }
        } catch (error) { 
            showNotification(`刪除失敗: ${error.message}`, 'error'); 
        }
    }
}

function handleReviewItemClick() {
    $('.review-item').removeClass('bg-indigo-50');
    $(this).addClass('bg-indigo-50');
    const rowIndex = $(this).data('row-index'), isCommunity = $(this).data('is-community');
    const report = rawReports.find(r => r.rowIndex == rowIndex && !!r.isCommunity === isCommunity);
    if (report) displayReviewDetails(report);
}

async function handleAdminActionClick() {
    const action = $(this).data('action');
    const report = $('#review-detail-panel').data('report');
    const profile = getUserProfile();

    if (!report || (action === 'delete' && !confirm('確定要永久刪除嗎？'))) return;

    try {
        const result = await api.sendAdminAction(action, report.rowIndex, !!report.isCommunity, profile);
        if (result.status === 'success') {
            showNotification('操作成功！', 'success');
            document.dispatchEvent(new CustomEvent('refresh-data', { detail: { source: 'review' } }));
        } else {
            throw new Error(result.message || '操作失敗');
        }
    } catch (error) {
        showNotification(`操作失敗: ${error.message}`, 'error');
    }
}

async function openEditModalForUser(report) {
    const isArea = !!report.isCommunity;
    const forms = [$('#add-location-form'), $('#add-location-form-mobile')];
    forms.forEach($f => {
        $f[0].reset();
        $f.find('#edit-row-index').val(isArea ? '' : report.rowIndex);
        $f.find('#edit-area-row-index').val(isArea ? report.rowIndex : '').data('bounds', report.areaBounds);
        $f.find('#edit-original-name').val(report['地址']);
        $f.find('#add-address').val(report['地址']);
        $f.find('#add-area-name').val(report.areaName || '');
        $f.find('#add-category').val(report['分類']);
        $f.find('#add-blacklist-category').val(report['黑名類別']);
        $f.find('#add-blacklist-reason').val(report['黑名原因']);
        $f.closest('[id^="add-location-modal"]').find('h2').text(isArea ? '修改建築' : '修改地點');
        $f.find('#add-category, #add-blacklist-category, #add-blacklist-reason').closest('div').toggle(!isArea);
    });
    
    closeManagementModal();
    const coord = ol.proj.fromLonLat([parseFloat(report['經度']), parseFloat(report['緯度'])]);
    
    isMobile ? enterMobilePlacementMode(coord, report.areaBounds) : enterDesktopAddMode(coord, report.areaBounds);
}

// --- 渲染輔助函式 ---
function getStatusBadge(s) {
    const status = String(s).toUpperCase();
    if (status === 'TRUE') return '<span class="text-green-600 font-semibold">已通過</span>';
    if (status === 'REJECT') return '<span class="text-red-600 font-semibold">已駁回</span>';
    return '<span class="text-yellow-600 font-semibold">待審核</span>';
}

function renderAreaOnMap(mapId, areaBounds) {
    if (!areaBounds) return null;
    try {
        const { o: [lon, lat] } = JSON.parse(areaBounds);
        return new ol.Map({
            target: mapId,
            layers: [new ol.layer.Tile({ source: new ol.source.OSM() })],
            view: new ol.View({ center: ol.proj.fromLonLat([parseFloat(lon), parseFloat(lat)]), zoom: 18 }),
            controls: [], interactions: [],
        });
    } catch(e) {
        $(`#${mapId}`).html('<p class="text-xs text-red-500 p-2">範圍資料錯誤</p>');
        return null;
    }
}
