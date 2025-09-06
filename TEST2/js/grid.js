/**
 * @file 管理地圖上的網格繪製、工具列和互動。
 */
import { map, dragPanInteraction } from './map.js';
import { GRID_INTERVAL, GRID_PRECISION, GRID_DRAW_RADIUS, GRID_ZOOM_LEVEL_WEB, GRID_ZOOM_LEVEL_MOBILE } from './config.js';
import { showNotification } from './ui.js';

// --- 模組內部狀態 ---
let isAreaSelectionMode = false;
let selectedGridCells = new Map();
let currentAreaColor = 'rgba(239, 68, 68, 0.7)';
let currentMarkerColor = '#000000';
let currentAreaTool = 'fill';
let lockedCenterForEditing = null; // 編輯時鎖定的中心點
let areaBoundsForEditing = null;  // 編輯時載入的原始資料
let isDrawingOnGrid = false;
let lastPaintedCellKey = null;
let cachedActionButtons = null; // 用於在行動裝置上暫存按鈕

const gridCanvas = document.getElementById('grid-canvas');
const gridCtx = gridCanvas.getContext('2d');
const isMobile = window.innerWidth < 768;

// --- 事件處理函式 ---

const mapPointerDown = function(evt) {
    if (evt.originalEvent.button !== 0 || !isAreaSelectionMode || currentAreaTool === 'pan') return;
    isDrawingOnGrid = true;
    paintCell(evt);
    map.on('pointermove', mapPointerMove);
    map.getViewport().addEventListener('pointerup', mapPointerUp, { once: true });
};

const mapPointerMove = function(evt) {
    if (isDrawingOnGrid) paintCell(evt);
};

const mapPointerUp = function() {
    isDrawingOnGrid = false;
    lastPaintedCellKey = null;
    map.un('pointermove', mapPointerMove);
};


/**
 * 開啟或關閉區域選擇模式 (網格模式)。
 * @param {boolean} enable - 是否啟用。
 * @param {string|null} boundsToLoad - (可選) 載入已儲存的區域資料。
 */
export function toggleAreaSelectionMode(enable, boundsToLoad = null) {
    isAreaSelectionMode = enable;
    areaBoundsForEditing = boundsToLoad; // 儲存傳入的資料以供編輯

    map.un('moveend', drawGrid);
    $('#grid-color-palette').toggleClass('hidden', !enable);

    if (enable) {
        const zoomThreshold = isMobile ? GRID_ZOOM_LEVEL_MOBILE : GRID_ZOOM_LEVEL_WEB;
        map.getView().animate({ zoom: zoomThreshold, duration: 800 });
        $('#map').addClass('map-enhanced grid-mode-active paint-mode');
        
        if (dragPanInteraction) dragPanInteraction.setActive(false);
        
        $('#location-instruction').text('請在地圖上的網格標示範圍。');
        $('#desktop-center-marker').addClass('hidden');
        
        // 處理行動裝置 UI
        if (isMobile) {
            const $buttons = $('#main-action-buttons');
            if ($buttons.length) cachedActionButtons = $buttons.detach();
            $('#add-location-modal-mobile').addClass('minimized');
            $('#restore-mobile-modal-btn').removeClass('hidden');
        }
        
        selectedGridCells.clear();
        if (areaBoundsForEditing) {
            loadAreaBounds(areaBoundsForEditing);
        }
        
        $('#grid-canvas').removeClass('hidden');
        drawGrid();
        map.on('moveend', drawGrid);
        map.on('pointerdown', mapPointerDown);

    } else {
        $('#map').removeClass('map-enhanced grid-mode-active paint-mode pan-mode');
        if (dragPanInteraction) dragPanInteraction.setActive(true);
        
        // 恢復行動裝置 UI
        if (isMobile) {
            if (cachedActionButtons) {
                $('#map-container').append(cachedActionButtons);
                cachedActionButtons = null;
            }
            $('#add-location-modal-mobile').removeClass('minimized');
            $('#restore-mobile-modal-btn').addClass('hidden');
        } else {
             $('#desktop-center-marker').removeClass('hidden');
        }
        
        $('#location-instruction').text('請移動地圖中心點來選擇位置。');
        $('#grid-canvas').addClass('hidden');
        $('#grid-toolbar').addClass('hidden').removeClass('flex');
        gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        map.un('pointerdown', mapPointerDown);
    }
}

/**
 * 在 Canvas 上繪製網格和已選取的儲存格。
 */
function drawGrid() {
    if (!isAreaSelectionMode) return;
    
    const mapSize = map.getSize();
    gridCanvas.width = mapSize[0];
    gridCanvas.height = mapSize[1];
    gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    
    $('#grid-toolbar').removeClass('hidden').addClass('flex');

    const extent = map.getView().calculateExtent(mapSize);
    const [minLon, minLat] = ol.proj.toLonLat(ol.extent.getBottomLeft(extent));
    const [maxLon, maxLat] = ol.proj.toLonLat(ol.extent.getTopRight(extent));
    
    const startLon = Math.floor(minLon / GRID_INTERVAL) * GRID_INTERVAL;
    const startLat = Math.floor(minLat / GRID_INTERVAL) * GRID_INTERVAL;
    
    // 繪製網格線
    gridCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    gridCtx.lineWidth = 1;
    gridCtx.beginPath();
    for (let lon = startLon; lon < maxLon; lon += GRID_INTERVAL) {
        const pixel = map.getPixelFromCoordinate(ol.proj.fromLonLat([lon, minLat]));
        if (pixel) {
            gridCtx.moveTo(pixel[0], 0);
            gridCtx.lineTo(pixel[0], mapSize[1]);
        }
    }
    for (let lat = startLat; lat < maxLat; lat += GRID_INTERVAL) {
        const pixel = map.getPixelFromCoordinate(ol.proj.fromLonLat([minLon, lat]));
        if (pixel) {
            gridCtx.moveTo(0, pixel[1]);
            gridCtx.lineTo(mapSize[0], pixel[1]);
        }
    }
    gridCtx.stroke();

    // 繪製已選取的儲存格
    gridCtx.font = 'bold 16px sans-serif';
    gridCtx.textAlign = 'center';
    gridCtx.textBaseline = 'middle';
    
    selectedGridCells.forEach((data, cellKey) => {
        const [lon, lat] = cellKey.split('-').map(Number);
        const p1 = map.getPixelFromCoordinate(ol.proj.fromLonLat([lon, lat]));
        const p2 = map.getPixelFromCoordinate(ol.proj.fromLonLat([lon + GRID_INTERVAL, lat + GRID_INTERVAL]));
        if (!p1 || !p2) return;

        const width = Math.abs(p2[0] - p1[0]);
        const height = Math.abs(p1[1] - p2[1]);
        
        if (data.fillColor) {
            gridCtx.fillStyle = data.fillColor;
            gridCtx.fillRect(p1[0], p2[1], width, height);
        }
        
        if (data.marker) {
            gridCtx.fillStyle = data.markerColor || '#000000';
            const markerText = { 'entrance': '入', 'exit': '出', 'table': '桌', 'parking': '停' }[data.marker];
            gridCtx.fillText(markerText, p1[0] + width / 2, p2[1] + height / 2);
        }
    });

    // 繪製鎖定的中心點
    if (lockedCenterForEditing) {
        const pixel = map.getPixelFromCoordinate(lockedCenterForEditing);
        if (pixel) {
            gridCtx.beginPath();
            gridCtx.arc(pixel[0], pixel[1], 5, 0, 2 * Math.PI, false);
            gridCtx.fillStyle = 'red';
            gridCtx.fill();
            gridCtx.lineWidth = 2;
            gridCtx.strokeStyle = 'white';
            gridCtx.stroke();
        }
    }
}

/**
 * 處理在網格上繪製或擦除的邏輯。
 * @param {ol.MapBrowserEvent} evt - 地圖事件。
 */
function paintCell(evt) {
    if (currentAreaTool === 'pan') return;

    const coord = map.getCoordinateFromPixel(evt.pixel);
    if (!coord) return;
    const [lon, lat] = ol.proj.toLonLat(coord);
    
    const snappedLon = Math.floor(lon / GRID_INTERVAL) * GRID_INTERVAL;
    const snappedLat = Math.floor(lat / GRID_INTERVAL) * GRID_INTERVAL;
    const cellKey = `${snappedLon.toFixed(GRID_PRECISION)}-${snappedLat.toFixed(GRID_PRECISION)}`;
    
    if (cellKey === lastPaintedCellKey) return;
    lastPaintedCellKey = cellKey;

    const centerCoords = lockedCenterForEditing || map.getView().getCenter();
    const centerLonLat = ol.proj.toLonLat(centerCoords);
    if (ol.sphere.getDistance(centerLonLat, [snappedLon, snappedLat]) > GRID_DRAW_RADIUS) return;

    const existingData = selectedGridCells.get(cellKey);

    if (currentAreaTool === 'fill') {
        if (existingData && existingData.fillColor) { // 再次點擊取消填色
            delete existingData.fillColor;
            if (!existingData.marker) selectedGridCells.delete(cellKey);
        } else {
            const newData = existingData || {};
            newData.fillColor = currentAreaColor;
            selectedGridCells.set(cellKey, newData);
        }
    } else if (currentAreaTool === 'eraser') {
        selectedGridCells.delete(cellKey);
    } else { // 標記工具
        const newData = existingData || {};
        newData.marker = newData.marker === currentAreaTool ? null : currentAreaTool;
        if (newData.marker) newData.markerColor = currentMarkerColor;
        
        if (!newData.fillColor && !newData.marker) {
            selectedGridCells.delete(cellKey);
        } else {
            selectedGridCells.set(cellKey, newData);
        }
    }
    drawGrid();
}

/**
 * 設置網格工具列的事件監聽器。
 */
export function setupGridToolbar() {
    $('#palette-fill-color').on('input', function() {
        const hex = $(this).val();
        const [r, g, b] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        currentAreaColor = `rgba(${r}, ${g}, ${b}, 0.7)`;
    });

    $('#palette-marker-color').on('input', function() {
        currentMarkerColor = $(this).val();
    });

    $('.grid-tool-btn').on('click', function() {
        const $btn = $(this);
        if ($btn.hasClass('active')) return;
        
        $('.grid-tool-btn').removeClass('active');
        $btn.addClass('active');
        currentAreaTool = $btn.attr('id').replace('tool-', '');

        if (currentAreaTool === 'pan') {
            if (dragPanInteraction) dragPanInteraction.setActive(true);
            $('#map').removeClass('paint-mode').addClass('pan-mode');
        } else {
            if (dragPanInteraction) dragPanInteraction.setActive(false);
            $('#map').removeClass('pan-mode').addClass('paint-mode');
        }
    });
}

/**
 * 從 JSON 字串載入區域邊界資料。
 * @param {string} boundsToLoad - 包含區域資料的 JSON 字串。
 */
function loadAreaBounds(boundsToLoad) {
    try {
        const data = JSON.parse(boundsToLoad);
        let cellsToLoad;

        if (data.v === 1) { // 處理 V1 壓縮格式
            const { o: originCoords, p: palette, c: compressedCells } = data;
            const origin = { lon: parseFloat(originCoords[0]), lat: parseFloat(originCoords[1]) };
            const markerReverseMap = { 'e': 'entrance', 'x': 'exit', 't': 'table', 'p': 'parking' };

            cellsToLoad = compressedCells.map(str => {
                const [coordsPart, fill, marker, markerColor] = str.split(':');
                const [x, y] = coordsPart.split(',').map(Number);
                const lon = origin.lon + x * GRID_INTERVAL;
                const lat = origin.lat + y * GRID_INTERVAL;
                const cellData = {};
                if (fill !== '') cellData.fillColor = palette.f[parseInt(fill)];
                if (marker !== '') cellData.marker = markerReverseMap[marker];
                if (markerColor !== '') cellData.markerColor = palette.m[parseInt(markerColor)];
                return { key: `${lon.toFixed(GRID_PRECISION)}-${lat.toFixed(GRID_PRECISION)}`, data: cellData };
            });
        } else { // 處理舊格式
            cellsToLoad = data.map(cell => ({
                key: `${cell.lon.toFixed(GRID_PRECISION)}-${cell.lat.toFixed(GRID_PRECISION)}`,
                data: { fillColor: cell.fillColor, marker: cell.marker, markerColor: cell.markerColor }
            }));
        }
        
        cellsToLoad.forEach(item => selectedGridCells.set(item.key, item.data));
        
    } catch (e) {
        console.error("載入建築範圍資料失敗:", e);
        showNotification('讀取建築範圍資料失敗！', 'error');
    }
}


// --- Getters & Setters for other modules ---
export const getSelectedGridCells = () => selectedGridCells;
export const clearSelectedGridCells = () => selectedGridCells.clear();
export const isAreaSelectionModeActive = () => isAreaSelectionMode;
export const getLockedCenter = () => lockedCenterForEditing;
export const setLockedCenter = (center) => { lockedCenterForEditing = center; };
export const getAreaBoundsForEditing = () => areaBoundsForEditing;

