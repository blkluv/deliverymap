/**
 * @file 處理「網格標示」功能的邏輯。
 */
import { map, dragPanInteraction } from './map.js';
import { uiState } from './ui.js';
import { GRID_INTERVAL, GRID_PRECISION, GRID_DRAW_RADIUS, GRID_ZOOM_LEVEL_WEB, GRID_ZOOM_LEVEL_MOBILE } from './config.js';

// --- 模組內部狀態 ---
let selectedGridCells = new Map();
let currentAreaColor = 'rgba(239, 68, 68, 0.7)';
let currentMarkerColor = '#000000';
let currentAreaTool = 'fill';
let lastPaintedCellKey = null;
let lockedCenterForEditing = null; // 編輯模式下鎖定的中心點
let cachedActionButtons = null; // 用於暫存行動版按鈕

const gridCanvas = document.getElementById('grid-canvas');
const gridCtx = gridCanvas.getContext('2d');
const isMobile = window.innerWidth < 768;

export const getSelectedGridCells = () => selectedGridCells;
export const clearSelectedGridCells = () => selectedGridCells.clear();
export const setLockedCenterForEditing = (coords) => lockedCenterForEditing = coords;

/**
 * 繪製網格和已選取的儲存格。
 */
function drawGrid() {
    if (!uiState.isDrawingOnGrid) return;
    
    const mapSize = map.getSize();
    gridCanvas.width = mapSize[0];
    gridCanvas.height = mapSize[1];
    gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    
    const extent = map.getView().calculateExtent(mapSize);
    const [minLon, minLat] = ol.proj.toLonLat(ol.extent.getBottomLeft(extent));
    const [maxLon, maxLat] = ol.proj.toLonLat(ol.extent.getTopRight(extent));
    
    // 繪製網格線
    gridCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    gridCtx.lineWidth = 1;
    gridCtx.beginPath();
    for (let lon = Math.floor(minLon / GRID_INTERVAL) * GRID_INTERVAL; lon < maxLon; lon += GRID_INTERVAL) {
        const pixel = map.getPixelFromCoordinate(ol.proj.fromLonLat([lon, minLat]));
        if(pixel) gridCtx.moveTo(pixel[0], 0), gridCtx.lineTo(pixel[0], mapSize[1]);
    }
    for (let lat = Math.floor(minLat / GRID_INTERVAL) * GRID_INTERVAL; lat < maxLat; lat += GRID_INTERVAL) {
        const pixel = map.getPixelFromCoordinate(ol.proj.fromLonLat([minLon, lat]));
        if(pixel) gridCtx.moveTo(0, pixel[1]), gridCtx.lineTo(mapSize[0], pixel[1]);
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

        const width = Math.abs(p2[0] - p1[0]), height = Math.abs(p1[1] - p2[1]);
        
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
}


/**
 * 根據使用者互動繪製/擦除儲存格。
 * @param {ol.MapBrowserEvent} evt - 地圖瀏覽器事件。
 */
function paintCell(evt) {
    if (currentAreaTool === 'pan' || !uiState.isDrawingOnGrid) return;

    const coord = map.getCoordinateFromPixel(evt.pixel);
    if (!coord) return;
    const [lon, lat] = ol.proj.toLonLat(coord);
    
    const snappedLon = Math.floor(lon / GRID_INTERVAL) * GRID_INTERVAL;
    const snappedLat = Math.floor(lat / GRID_INTERVAL) * GRID_INTERVAL;
    const cellKey = `${snappedLon.toFixed(GRID_PRECISION)}-${snappedLat.toFixed(GRID_PRECISION)}`;
    
    if (cellKey === lastPaintedCellKey) return;
    lastPaintedCellKey = cellKey;

    const existingData = selectedGridCells.get(cellKey) || {};

    if (currentAreaTool === 'fill') {
        if (existingData.fillColor) delete existingData.fillColor;
        else existingData.fillColor = currentAreaColor;
    } else if (currentAreaTool === 'eraser') {
        selectedGridCells.delete(cellKey);
    } else { // Marker tools
        if (existingData.marker === currentAreaTool) delete existingData.marker;
        else {
            existingData.marker = currentAreaTool;
            existingData.markerColor = currentMarkerColor;
        }
    }
    
    // 如果儲存格沒有任何資料，則從 Map 中刪除
    if (Object.keys(existingData).length === 0) {
        selectedGridCells.delete(cellKey);
    } else {
        selectedGridCells.set(cellKey, existingData);
    }

    drawGrid();
}

/**
 * 切換網格選擇模式的開關。
 * @param {boolean} enable - 是否啟用。
 * @param {string|null} areaBoundsToLoad - (編輯模式) 要載入的網格資料。
 */
export function toggleAreaSelectionMode(enable, areaBoundsToLoad = null) {
    uiState.isDrawingOnGrid = enable;
    
    $('#grid-toolbar').toggleClass('hidden flex', enable).toggleClass('flex', enable);
    $('#grid-color-palette').toggleClass('hidden', !enable);
    $('#grid-canvas').toggleClass('hidden', !enable);
    $('#map').toggleClass('map-enhanced grid-mode-active', enable);

    if (enable) {
        map.getView().animate({ zoom: isMobile ? GRID_ZOOM_LEVEL_MOBILE : GRID_ZOOM_LEVEL_WEB });
        dragPanInteraction.setActive(currentAreaTool === 'pan');
        $('#map').addClass(currentAreaTool === 'pan' ? 'pan-mode' : 'paint-mode');
        
        if (isMobile) {
            cachedActionButtons = $('#main-action-buttons').detach();
        }

        selectedGridCells.clear();
        if (areaBoundsToLoad) loadGridData(areaBoundsToLoad);
        
        drawGrid();
        map.on('moveend', drawGrid);
        map.on('pointerdown', handleMapPointerDown);
    } else {
        dragPanInteraction.setActive(true);
        $('#map').removeClass('map-enhanced grid-mode-active paint-mode pan-mode');
        if (isMobile && cachedActionButtons) {
            $('#map-container').append(cachedActionButtons);
            cachedActionButtons = null;
        }
        gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        map.un('moveend', drawGrid);
        map.un('pointerdown', handleMapPointerDown);
    }
}

/**
 * 從 JSON 字串載入網格資料到 selectedGridCells。
 * @param {string} areaBoundsStr - 包含網格資料的 JSON 字串。
 */
function loadGridData(areaBoundsStr) {
    try {
        const data = JSON.parse(areaBoundsStr);
        if (data.v === 1) { // v1 壓縮格式
            const { o, p, c } = data;
            const origin = { lon: parseFloat(o[0]), lat: parseFloat(o[1]) };
            const markerMap = { e: 'entrance', x: 'exit', t: 'table', p: 'parking' };
            
            c.forEach(cellStr => {
                const [coords, fillIdx, markerChar, markerColorIdx] = cellStr.split(':');
                const [x, y] = coords.split(',').map(Number);
                const lon = origin.lon + x * GRID_INTERVAL;
                const lat = origin.lat + y * GRID_INTERVAL;
                const key = `${lon.toFixed(GRID_PRECISION)}-${lat.toFixed(GRID_PRECISION)}`;
                
                const cellData = {};
                if (fillIdx !== '') cellData.fillColor = p.f[parseInt(fillIdx)];
                if (markerChar !== '') cellData.marker = markerMap[markerChar];
                if (markerColorIdx !== '') cellData.markerColor = p.m[parseInt(markerColorIdx)];
                
                selectedGridCells.set(key, cellData);
            });
        } else { // 舊格式
            data.forEach(cell => {
                const { lon, lat, ...cellData } = cell;
                const key = `${lon.toFixed(GRID_PRECISION)}-${lat.toFixed(GRID_PRECISION)}`;
                selectedGridCells.set(key, cellData);
            });
        }
    } catch(e) {
        console.error("載入網格資料失敗:", e);
    }
}


// --- 事件處理函式 ---
function handleMapPointerDown(evt) {
    if (evt.originalEvent.button !== 0 || currentAreaTool === 'pan') return;
    paintCell(evt);
    map.on('pointermove', paintCell); // 持續繪製
    map.getViewport().addEventListener('pointerup', () => {
        map.un('pointermove', paintCell);
        lastPaintedCellKey = null;
    }, { once: true });
}

/**
 * 設定網格工具列的事件監聽器。
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
        if ($btn.hasClass('active')) return;

        $('.grid-tool-btn').removeClass('active');
        $btn.addClass('active');
        currentAreaTool = this.id.replace('tool-', '');
        
        const isPan = currentAreaTool === 'pan';
        dragPanInteraction.setActive(isPan);
        $('#map').removeClass('paint-mode pan-mode').addClass(isPan ? 'pan-mode' : 'paint-mode');
    });

    // 監聽表單中的 "標示為整個社區/區域" checkbox
    $(document).on('change', '#add-is-area', function() {
        const isChecked = $(this).is(':checked');
        const isAreaEdit = !!($('#edit-area-row-index').val());
        
        if(isChecked) {
            setLockedCenterForEditing(map.getView().getCenter());
        } else {
            setLockedCenterForEditing(null);
        }
        toggleAreaSelectionMode(isChecked, isAreaEdit ? $('#edit-area-row-index').data('bounds') : null);
    });
}

