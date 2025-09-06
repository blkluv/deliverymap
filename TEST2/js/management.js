/**
 * @file 處理「我的貢獻管理」和「管理員審核」面板的邏輯。
 */
import { showNotification } from './ui.js';
import { sendAdminAction, userDelete, getAddressFromCoords } from './api.js';
import { getLoginStatus, getUserProfile } from './auth.js';
import { enterMobilePlacementMode, enterDesktopAddMode } from './add-location.js';
import { categoryColors } from './config.js';

// --- 模組內部狀態 ---
let rawReports = [];
let reviewMapInstance = null; // 審核面板中的地圖實例
let managementAreaMaps = {};  // 管理面板中的多個地圖實例
const isMobile = window.innerWidth < 768;


/**
 * 從主模組設定原始報告資料。
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
        // 觸發自訂事件，讓 main.js 重新載入資料
        document.dispatchEvent(new CustomEvent('refresh-data', { detail: { source: 'review' } }));
    });

    // --- 事件代理 ---
    $('#management-list-content').on('click', '.edit-store-btn', handleEditClick);
    $('#management-list-content, #management-area-content').on('click', '.delete-store-btn', handleDeleteClick);
    $('#management-area-content').on('click', '.edit-area-btn', handleEditClick);
    
    $('#review-list-panel').on('click', '.review-item', handleReviewItemClick);
    $('#review-detail-panel').on('click', '.admin-action-btn', handleAdminActionClick);
}

// --- 我的貢獻 Modal ---

function openManagementModal() {
    $('#management-modal').removeClass('hidden');
    switchManagementTab('locations'); // 預設顯示地點
}

function closeManagementModal() {
    $('#management-modal').addClass('hidden');
    // 清理地圖實例，防止記憶體洩漏
    Object.values(managementAreaMaps).forEach(map => map?.setTarget(null));
    managementAreaMaps = {};
}

function switchManagementTab(tab) {
    if (tab === 'locations') {
        $('#manage-locations-tab').addClass('border-indigo-500 text-indigo-600').removeClass('border-transparent text-gray-500');
        $('#manage-areas-tab').removeClass('border-indigo-500 text-indigo-600').addClass('border-transparent text-gray-500');
        $('#management-list-content').removeClass('hidden');
        $('#management-area-content').addClass('hidden');
        loadUserLocations();
    } else {
        $('#manage-areas-tab').addClass('border-indigo-500 text-indigo-600').removeClass('border-transparent text-gray-500');
        $('#manage-locations-tab').removeClass('border-indigo-500 text-indigo-600').addClass('border-transparent text-gray-500');
        $('#management-area-content').removeClass('hidden');
        $('#management-list-content').addClass('hidden');
        loadUserAreas();
    }
}

function loadUserLocations() {
    const $content = $('#management-list-content').empty();
    const profile = getUserProfile();
    if (!getLoginStatus() || (!profile.email && !profile.lineUserId)) {
        $content.html('<p class="text-gray-500">請先登入以查看您提交的地點。</p>');
        return;
    }

    const submissions = rawReports.filter(r => !r.isCommunity && (r.submitterEmail === profile.email || r.lineUserId === profile.lineUserId));

    if (submissions.length === 0) {
        $content.html('<p class="text-gray-500">您尚未提交任何地點資料。</p>');
        return;
    }

    submissions.forEach(report => {
        const status = getStatusBadge(report['審核']);
        $content.append(`
            <div class="border-b py-3 flex justify-between items-center">
                <div>
                    <p class="font-semibold">${report['地址']}</p>
                    <p class="text-sm text-gray-600">${report['黑名類別']} - ${report['黑名原因']}</p>
                    <p class="text-xs text-gray-500 mt-1">狀態: ${status}</p>
                </div>
                <div>
                    <button class="edit-store-btn text-sm text-blue-600 hover:underline mr-4" data-row-index="${report.rowIndex}">修改</button>
                    <button class="delete-store-btn text-sm text-red-600 hover:underline" data-row-index="${report.rowIndex}" data-is-community="false">刪除</button>
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
     if (!getLoginStatus() || (!profile.email && !profile.lineUserId)) {
        $content.html('<p class="text-gray-500">請先登入以查看您提交的建築。</p>');
        return;
    }

    const submissions = rawReports.filter(r => r.isCommunity && (r.submitterEmail === profile.email || r.lineUserId === profile.lineUserId));

    if (submissions.length === 0) {
        $content.html('<p class="text-gray-500">您尚未提交任何建築資料。</p>');
        return;
    }

    for (const area of submissions) {
        const status = getStatusBadge(area['審核']);
        const mapId = `management-map-${area.rowIndex}`;
        const addressId = `area-address-${area.rowIndex}`;
        
        const $areaHtml = $(`
            <div class="border rounded-lg p-4 mb-4 flex items-center space-x-4">
                <div id="${mapId}" class="w-24 h-24 bg-gray-100 rounded border flex-shrink-0"></div>
                <div class="flex-grow">
                    <h4 class="font-bold text-lg">${area.areaName || '未命名社區'}</h4>
                    <p id="${addressId}" class="text-sm text-gray-600">${area['地址'] || '正在取得地址...'}</p>
                    <div class="mt-2">狀態: ${status}</div>
                </div>
                <div class="flex flex-col space-y-2">
                    <button class="edit-area-btn text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600" data-row-index="${area.rowIndex}" data-is-community="true">修改</button>
                    <button class="delete-store-btn text-sm bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600" data-row-index="${area.rowIndex}" data-is-community="true">刪除</button>
                </div>
            </div>
        `);
        $content.append($areaHtml);

        if (!area['地址'] && area.areaBounds) {
             try {
                const boundsData = JSON.parse(area.areaBounds);
                if (boundsData.v === 1 && boundsData.o) {
                    const [lon, lat] = boundsData.o;
                    const address = await getAddressFromCoords(parseFloat(lon), parseFloat(lat));
                    $(`#${addressId}`).text(address);
                }
            } catch(e) { console.error("Could not parse areaBounds for address", e); }
        }
        
        setTimeout(() => {
           managementAreaMaps[area.rowIndex] = renderAreaOnMap(mapId, area.areaBounds);
        }, 0);
    }
}

// --- 管理員審核 Modal ---

function openReviewModal() {
    $('#review-modal').removeClass('hidden');
    switchReviewTab('pending'); // 預設顯示待審核
}

function closeReviewModal() {
    $('#review-modal').addClass('hidden');
    if (reviewMapInstance) {
        reviewMapInstance.setTarget(null);
        reviewMapInstance = null;
    }
}

function switchReviewTab(tab) {
    if (tab === 'pending') {
        $('#pending-tab').addClass('border-indigo-500 text-indigo-600').removeClass('border-transparent text-gray-500');
        $('#approved-tab').removeClass('border-indigo-500 text-indigo-600').addClass('border-transparent text-gray-500');
    } else {
        $('#approved-tab').addClass('border-indigo-500 text-indigo-600').removeClass('border-transparent text-gray-500');
        $('#pending-tab').removeClass('border-indigo-500 text-indigo-600').addClass('border-transparent text-gray-500');
    }
    loadReviewData(tab);
}

function loadReviewData(status = 'pending') {
    const $listPanel = $('#review-list-panel').empty();
    $('#review-detail-panel').html('<p class="text-gray-500">請從左側列表選擇一個項目以查看詳細資訊。</p>');

    const reports = rawReports.filter(r => {
        const currentStatus = String(r['審核']).toUpperCase();
        if (status === 'pending') {
            return currentStatus !== 'TRUE' && currentStatus !== 'REJECT';
        }
        return currentStatus === 'TRUE' || currentStatus === 'REJECT';
    });

    if (reports.length === 0) {
        $listPanel.html(`<p class="p-4 text-sm text-gray-500">沒有${status === 'pending' ? '待審核' : '已處理'}的項目。</p>`);
        return;
    }

    reports.forEach(report => {
        $listPanel.append(`
            <div class="p-4 border-b cursor-pointer hover:bg-gray-100 review-item" data-row-index="${report.rowIndex}" data-is-community="${!!report.isCommunity}">
                <p class="font-semibold">${report.areaName || report['地址']}</p>
                <p class="text-sm text-gray-600 truncate">${report['黑名原因'] || '社區/建築'}</p>
                <p class="text-xs text-gray-400 mt-1">${report.submitterEmail || 'N/A'}</p>
            </div>
        `);
    });
}

function displayReviewDetails(report) {
    const $detailPanel = $('#review-detail-panel').empty();
    const submissionDate = report.timestamp ? new Date(report.timestamp).toLocaleString('zh-TW') : '不明';

    if (report.isCommunity) {
        $detailPanel.html(`
            <div id="review-map-container" class="w-full h-64 bg-gray-200 mb-4 rounded-lg"><div id="review-map" class="w-full h-full"></div></div>
            <div class="space-y-2 text-sm">
                <h3 class="text-xl font-bold">${report.areaName || '未命名社區'}</h3><hr>
                <p><strong>座標:</strong> ${parseFloat(report['經度']).toFixed(5)}, ${parseFloat(report['緯度']).toFixed(5)}</p>
                <p><strong>提交者:</strong> ${report.submitterEmail || 'N/A'}</p>
                <p><strong>時間:</strong> ${submissionDate}</p>
                <p><strong>Row:</strong> ${report.rowIndex}</p>
            </div>
            <div class="mt-6 flex space-x-4">
                <button class="admin-action-btn flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700" data-action="approve">通過</button>
                <button class="admin-action-btn flex-1 bg-yellow-600 text-white py-2 rounded hover:bg-yellow-700" data-action="reject">駁回</button>
            </div>
        `);
        setTimeout(() => {
            if (reviewMapInstance) reviewMapInstance.setTarget(null);
            reviewMapInstance = renderAreaOnMap('review-map', report.areaBounds);
        }, 0);
    } else {
        $detailPanel.html(`
            <div class="space-y-3 text-sm">
                <h3 class="text-xl font-bold">${report['地址']}</h3>
                <p class="font-semibold" style="color: ${categoryColors[report['分類']] || '#ccc'}">${report['分類']}</p><hr>
                <p><strong>黑名類別:</strong> ${report['黑名類別']}</p>
                <p><strong>黑名原因:</strong></p>
                <p class="whitespace-pre-wrap bg-gray-50 p-2 rounded">${report['黑名原因']}</p><hr>
                <p><strong>座標:</strong> ${parseFloat(report['經度']).toFixed(5)}, ${parseFloat(report['緯度']).toFixed(5)}</p>
                <p><strong>提交者:</strong> ${report.submitterEmail || 'N/A'}</p>
                <p><strong>時間:</strong> ${submissionDate}</p>
                <p><strong>Row:</strong> ${report.rowIndex}</p>
            </div>
            <div class="mt-6 flex space-x-4">
                <button class="admin-action-btn flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700" data-action="approve">通過</button>
                <button class="admin-action-btn flex-1 bg-yellow-600 text-white py-2 rounded hover:bg-yellow-700" data-action="reject">駁回</button>
                <button class="admin-action-btn flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700" data-action="delete">刪除</button>
            </div>
        `);
    }
    // 將報告資料附加到面板上以便後續操作
    $detailPanel.data('report', report);
}

// --- 事件處理輔助函式 ---

async function handleEditClick() {
    const rowIndex = $(this).data('row-index');
    const isCommunity = $(this).data('is-community');
    const reportToEdit = rawReports.find(r => r.rowIndex == rowIndex && !!r.isCommunity === isCommunity);

    if (reportToEdit) {
        await openEditModalForUser(reportToEdit);
    } else {
        showNotification('找不到資料，可能已被更新。', 'error');
    }
}

async function handleDeleteClick() {
    const rowIndex = $(this).data('row-index');
    const isCommunity = $(this).data('is-community');

    if (confirm('確定要刪除這筆您提交的資料嗎？此操作將無法復原。')) {
        showNotification('正在刪除...');
        try {
            await userDelete(rowIndex, isCommunity);
            showNotification("資料已成功刪除！", 'success');
            closeManagementModal();
            document.dispatchEvent(new CustomEvent('refresh-data'));
        } catch (error) {
            showNotification(`刪除失敗: ${error.message}`, 'error');
        }
    }
}

function handleReviewItemClick() {
    $('.review-item').removeClass('bg-indigo-50');
    $(this).addClass('bg-indigo-50');
    const rowIndex = $(this).data('row-index');
    const isCommunity = $(this).data('is-community');
    const report = rawReports.find(r => r.rowIndex == rowIndex && !!r.isCommunity === isCommunity);
    if (report) displayReviewDetails(report);
}

async function handleAdminActionClick() {
    const action = $(this).data('action');
    const report = $('#review-detail-panel').data('report');
    if (!report) return;

    if (action === 'delete' && !confirm('確定要永久刪除這筆資料嗎？')) return;

    showNotification('正在執行操作...');
    try {
        const result = await sendAdminAction(action, report.rowIndex, !!report.isCommunity);
        if (result.status === 'success') {
            showNotification("操作成功！", 'success');
            // 觸發刷新
            document.dispatchEvent(new CustomEvent('refresh-data', { detail: { source: 'review' } }));
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        showNotification(`操作失敗: ${error.message}`, 'error');
    }
}

/**
 * 為使用者開啟編輯視窗。
 * @param {Object} report - 要編輯的報告物件。
 */
async function openEditModalForUser(report) {
    const isAreaEdit = !!report.isCommunity;
    const forms = [$('#add-location-form'), $('#add-location-form-mobile')];

    forms.forEach($f => {
        $f[0].reset();
        $f.find('#edit-row-index').val(isAreaEdit ? '' : report.rowIndex);
        $f.find('#edit-area-row-index').val(isAreaEdit ? report.rowIndex : '');
        $f.find('#edit-original-name').val(report['地址']);
        $f.find('#add-address').val(report['地址']);
        $f.find('#add-area-name').val(report.areaName || '');
        $f.find('#add-category').val(report['分類']);
        $f.find('#add-blacklist-category').val(report['黑名類別']);
        $f.find('#add-blacklist-reason').val(report['黑名原因']);
        $f.closest('div[id^="add-location-modal"]').find('h2').text(isAreaEdit ? '修改建築' : '修改地點');
        
        $f.find('#add-category, #add-blacklist-category, #add-blacklist-reason').closest('div').toggle(!isAreaEdit);
    });
    
    closeManagementModal();
    const coordinate = ol.proj.fromLonLat([parseFloat(report['經度']), parseFloat(report['緯度'])]);
    
    if (isMobile) {
        enterMobilePlacementMode(coordinate, report.areaBounds);
        $('#add-location-modal-mobile').removeClass('hidden');
        $('#complete-placement-btn').addClass('hidden');
    } else {
        enterDesktopAddMode(coordinate, report.areaBounds);
    }
}


// --- 渲染輔助函式 ---

function getStatusBadge(status) {
    const statusKey = String(status).toUpperCase();
    if (statusKey === 'TRUE') return '<span class="text-green-600 font-semibold">已通過</span>';
    if (statusKey === 'REJECT') return '<span class="text-red-600 font-semibold">已駁回</span>';
    return '<span class="text-yellow-600 font-semibold">待審核</span>';
}

function renderAreaOnMap(mapId, areaBounds) {
    if (!areaBounds) return null;
    try {
        const boundsData = JSON.parse(areaBounds);
        const source = new ol.source.Vector();
        const layer = new ol.layer.Vector({ source });
        
        // ... 此處應有解析 V1 或舊版 boundsData 並將 feature 加入 source 的邏輯 ...
        // 為了簡化，我們先假設能解析出中心點
        let centerLonLat = [121, 23.5]; 
        if (boundsData.v === 1 && boundsData.o) {
            centerLonLat = [parseFloat(boundsData.o[0]), parseFloat(boundsData.o[1])];
        }

        const map = new ol.Map({
            target: mapId,
            layers: [new ol.layer.Tile({ source: new ol.source.OSM() }), layer],
            view: new ol.View({
                center: ol.proj.fromLonLat(centerLonLat),
                zoom: 18,
            }),
            controls: [],
            interactions: [],
        });
        return map;
    } catch(e) {
        console.error("渲染區域地圖失敗:", e);
        $(`#${mapId}`).html('<p class="text-xs text-red-500 p-2">範圍資料錯誤</p>');
        return null;
    }
}

