/**
 * @file 處理「網格標示」功能的邏輯。
 */
import { map, dragPanInteraction } from './map.js';
import { uiState } from './ui.js';
import { GRID_INTERVAL, GRID_PRECISION, GRID_DRAW_RADIUS, GRID_ZOOM_LEVEL_WEB, GRID_ZOOM_LEVEL_MOBILE } from './config.js';

// --- 模組內部狀態 ---
const gridCanvas = document.getElementById('grid-canvas');
const gridCtx = gridCanvas.getContext('2d');
let selectedGridCells = new Map();
let currentAreaColor = 'rgba(239, 68, 68, 0.7)';
let currentMarkerColor = '#000000';
let currentAreaTool = 'fill';
let lastPaintedCellKey = null;
let lockedCenterForEditing = null; // 用於編輯模式下鎖定中心點
let cachedActionButtons = null; // 用於暫存行動版上的按鈕
const isMobile = window.innerWidth < 768;


export const getSelectedGridCells = () => selectedGridCells;
export const clearSelectedGridCells = () => selectedGridCells.clear();
export const setLockedCenterForEditing = (coords) => lockedCenterForEditing = coords;

/**
 * 切換網格標示模式的開關。
 * @param {boolean} enable - 是否啟用。
 * @param {string|null} areaBoundsToLoad - (編輯模式) 要載入的區域邊界資料。
 */
export function toggleAreaSelectionMode(enable, areaBoundsToLoad = null) {
    uiState.isDrawingOnGrid = enable;
    map.un('moveend', drawGrid);

    $('#grid-toolbar').toggleClass('hidden', !enable).toggleClass('flex', enable);
    $('#grid-color-palette').toggleClass('hidden', !enable);

    if (enable) {
        const zoomThreshold = isMobile ? GRID_ZOOM_LEVEL_MOBILE : GRID_ZOOM_LEVEL_WEB;
        map.getView().animate({ zoom: zoomThreshold });
        $('#map').addClass('map-enhanced grid-mode-active paint-mode');
        if (dragPanInteraction) dragPanInteraction.setActive(false);
        
        $('#location-instruction').text('請在地圖上的網格標示範圍。');
        $('#desktop-center-marker').addClass('hidden');
        
        if (isMobile) {
            const $buttons = $('#main-action-buttons');
            if ($buttons.length) cachedActionButtons = $buttons.detach();
            $('#add-location-modal-mobile').addClass('minimized');
            $('#restore-mobile-modal-btn').removeClass('hidden');
        }
        
        selectedGridCells.clear();
        if (areaBoundsToLoad) loadAreaBounds(areaBoundsToLoad);
        
        $('#grid-canvas').removeClass('hidden');
        drawGrid();
        map.on('moveend', drawGrid);
        map.getViewport().addEventListener('pointerdown', mapPointerDown);
    } else {
        $('#map').removeClass('map-enhanced grid-mode-active paint-mode pan-mode');
        if (dragPanInteraction) dragPanInteraction.setActive(true);
        if (isMobile && cachedActionButtons) {
            $('#map-container').append(cachedActionButtons);
            cachedActionButtons = null;
        }
        if (!isMobile) $('#desktop-center-marker').removeClass('hidden');
        
        $('#location-instruction').text('請移動地圖中心點來選擇位置。');
        $('#grid-canvas').addClass('hidden');
        gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        map.getViewport().removeEventListener('pointerdown', mapPointerDown);
    }
}

/**
 * 繪製網格和已選取的儲存格。
 */
function drawGrid() {
    if (!uiState.isDrawingOnGrid) return;
    
    const mapSize = map.getSize();
    if (!mapSize || mapSize[0] === 0 || mapSize[1] === 0) return;
    
    gridCanvas.width = mapSize[0];
    gridCanvas.height = mapSize[1];
    gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    
    const extent = map.getView().calculateExtent(mapSize);
    const [minLon, minLat] = ol.proj.toLonLat(ol.extent.getBottomLeft(extent));
    const [maxLon, maxLat] = ol.proj.toLonLat(ol.extent.getTopRight(extent));
    
    // 修正：補完繪製網格線的完整邏輯
    const startLon = Math.floor(minLon / GRID_INTERVAL) * GRID_INTERVAL;
    const startLat = Math.floor(minLat / GRID_INTERVAL) * GRID_INTERVAL;
    
    gridCtx.strokeStyle = 'rgba(128, 128, 128, 0.5)'; // 使用更清晰的顏色
    gridCtx.lineWidth = 1;
    gridCtx.beginPath();

    // 繪製垂直線
    for (let lon = startLon; lon < maxLon; lon += GRID_INTERVAL) {
        const pixel = map.getPixelFromCoordinate(ol.proj.fromLonLat([lon, minLat]));
        if(pixel) {
            gridCtx.moveTo(pixel[0], 0);
            gridCtx.lineTo(pixel[0], mapSize[1]);
        }
    }
    // 繪製水平線
    for (let lat = startLat; lat < maxLat; lat += GRID_INTERVAL) {
        const pixel = map.getPixelFromCoordinate(ol.proj.fromLonLat([minLon, lat]));
        if(pixel) {
            gridCtx.moveTo(0, pixel[1]);
            gridCtx.lineTo(mapSize[0], pixel[1]);
        }
    }
    gridCtx.stroke();
    
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

    if (lockedCenterForEditing) {
        const pixel = map.getPixelFromCoordinate(lockedCenterForEditing);
        if (pixel) {
            gridCtx.beginPath();
            gridCtx.arc(pixel[0], pixel[1], 5, 0, 2 * Math.PI);
            gridCtx.fillStyle = 'red';
            gridCtx.fill();
            gridCtx.lineWidth = 2;
            gridCtx.strokeStyle = 'white';
            gridCtx.stroke();
        }
    }
}


/**
 * 處理在網格上繪製/擦除的邏輯。
 * @param {ol.MapBrowserEvent} evt - 地圖事件。
 */
function paintCell(evt) {
    if (currentAreaTool === 'pan') return;

    const [lon, lat] = ol.proj.toLonLat(map.getCoordinateFromPixel(evt.pixel));
    const cellKey = `${(Math.floor(lon / GRID_INTERVAL) * GRID_INTERVAL).toFixed(GRID_PRECISION)}-${(Math.floor(lat / GRID_INTERVAL) * GRID_INTERVAL).toFixed(GRID_PRECISION)}`;
    
    if (cellKey === lastPaintedCellKey) return;
    lastPaintedCellKey = cellKey;

    const centerCoords = lockedCenterForEditing || map.getView().getCenter();
    if (ol.sphere.getDistance(ol.proj.toLonLat(centerCoords), [lon, lat]) > GRID_DRAW_RADIUS) return;

    const existingData = selectedGridCells.get(cellKey) || {};

    switch(currentAreaTool) {
        case 'fill':
            existingData.fillColor = existingData.fillColor ? null : currentAreaColor;
            break;
        case 'eraser':
            selectedGridCells.delete(cellKey);
            drawGrid();
            return;
        default: // Marker tools
            existingData.marker = existingData.marker === currentAreaTool ? null : currentAreaTool;
            if (existingData.marker) existingData.markerColor = currentMarkerColor;
    }

    if (!existingData.fillColor && !existingData.marker) {
        selectedGridCells.delete(cellKey);
    } else {
        selectedGridCells.set(cellKey, existingData);
    }
    drawGrid();
}

// --- 事件處理函式 ---
const mapPointerDown = (evt) => {
    if (evt.originalEvent.button !== 0 || !uiState.isDrawingOnGrid || currentAreaTool === 'pan') return;
    uiState.isPainting = true;
    paintCell(evt);
    map.getViewport().addEventListener('pointermove', mapPointerMove);
    map.getViewport().addEventListener('pointerup', mapPointerUp, { once: true });
};
const mapPointerMove = (evt) => uiState.isPainting && paintCell(evt);
const mapPointerUp = () => {
    uiState.isPainting = false;
    lastPaintedCellKey = null;
    map.getViewport().removeEventListener('pointermove', mapPointerMove);
};


/**
 * 載入並解析區域邊界資料以供編輯。
 * @param {string} areaBoundsStr - JSON 字串格式的區域資料。
 */
function loadAreaBounds(areaBoundsStr) {
    try {
        const boundsData = JSON.parse(areaBoundsStr);
        let cellsToLoad;
        if (boundsData.v === 1) { // v1 format
            const { o: originCoords, p: palette, c: compressed } = boundsData;
            const origin = { lon: parseFloat(originCoords[0]), lat: parseFloat(originCoords[1]) };
            const markerMap = { 'e': 'entrance', 'x': 'exit', 't': 'table', 'p': 'parking' };
            cellsToLoad = compressed.map(cellStr => {
                const [coords, fill, marker, markerColor] = cellStr.split(':');
                const [x, y] = coords.split(',').map(Number);
                const lon = origin.lon + GRID_INTERVAL;
                const lat = origin.lat + GRID_INTERVAL;
                const data = {};
                if (fill !== '') data.fillColor = palette.f[parseInt(fill, 10)];
                if (marker !== '') data.marker = markerMap[marker];
                if (markerColor !== '') data.markerColor = palette.m[parseInt(markerColor, 10)];
                return { key: `${lon.toFixed(GRID_PRECISION)}-${lat.toFixed(GRID_PRECISION)}`, data };
            });
        } else { // legacy format
            cellsToLoad = boundsData.map(cell => ({ 
                key: `${cell.lon.toFixed(GRID_PRECISION)}-${cell.lat.toFixed(GRID_PRECISION)}`, 
                data: { fillColor: cell.fillColor, marker: cell.marker, markerColor: cell.markerColor }
            }));
        }
        cellsToLoad.forEach(item => selectedGridCells.set(item.key, item.data));
    } catch(e) {
        console.error("載入建築範圍資料失敗:", e);
        showNotification('讀取建築範圍資料失敗！', 'error');
    }
}


/**
 * 初始化網格工具列的事件監聽器。
 */
export function setupGridToolbar() {
    $('#palette-fill-color').on('input', function() {
        const hex = $(this).val();
        const [r, g, b] = [parseInt(hex.slice(1,3), 16), parseInt(hex.slice(3,5), 16), parseInt(hex.slice(5,7), 16)];
        currentAreaColor = `rgba(${r}, ${g}, ${b}, 0.7)`;
        $('#tool-fill svg').css('stroke', hex);
    }).trigger('input');

    $('#palette-marker-color').on('input', function() {
        currentMarkerColor = $(this).val();
        $('#marker-tools .grid-tool-btn').css('color', currentMarkerColor);
    }).trigger('input');

    $('.grid-tool-btn').on('click', function() {
        const $btn = $(this);
        const toolId = $btn.attr('id');
        
        if ($btn.hasClass('active')) {
            if (toolId === 'tool-fill') $('#palette-fill-color').trigger('click');
            else if ($btn.closest('#marker-tools').length) $('#palette-marker-color').trigger('click');
            return;
        }
        
        $('.grid-tool-btn').removeClass('active');
        $btn.addClass('active');
        currentAreaTool = toolId.replace('tool-', '');

        if (dragPanInteraction) dragPanInteraction.setActive(currentAreaTool === 'pan');
        $('#map').toggleClass('pan-mode', currentAreaTool === 'pan').toggleClass('paint-mode', currentAreaTool !== 'pan');
    });
}
