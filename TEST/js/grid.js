import { state } from './state.js';
import { GRID_INTERVAL, GRID_PRECISION, GRID_DRAW_RADIUS, GRID_ZOOM_LEVEL_MOBILE, GRID_ZOOM_LEVEL_WEB } from './config.js';
import { showNotification } from './ui.js';

let gridCanvas, gridCtx;

function drawGrid() {
    if (!state.isAreaSelectionMode) return;
    
    const mapSize = state.map.getSize();
    gridCanvas.width = mapSize[0];
    gridCanvas.height = mapSize[1];
    gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    
    const extent = state.map.getView().calculateExtent(mapSize);
    const [minLon, minLat] = ol.proj.toLonLat(ol.extent.getBottomLeft(extent));
    const [maxLon, maxLat] = ol.proj.toLonLat(ol.extent.getTopRight(extent));
    
    const startLon = Math.floor(minLon / GRID_INTERVAL) * GRID_INTERVAL;
    const startLat = Math.floor(minLat / GRID_INTERVAL) * GRID_INTERVAL;
    
    gridCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    gridCtx.lineWidth = 1;
    gridCtx.beginPath();
    for (let lon = startLon; lon < maxLon; lon += GRID_INTERVAL) {
        const pixel = state.map.getPixelFromCoordinate(ol.proj.fromLonLat([lon, minLat]));
        if (pixel) {
            gridCtx.moveTo(pixel[0], 0);
            gridCtx.lineTo(pixel[0], mapSize[1]);
        }
    }
    for (let lat = startLat; lat < maxLat; lat += GRID_INTERVAL) {
        const pixel = state.map.getPixelFromCoordinate(ol.proj.fromLonLat([minLon, lat]));
        if (pixel) {
            gridCtx.moveTo(0, pixel[1]);
            gridCtx.lineTo(mapSize[0], pixel[1]);
        }
    }
    gridCtx.stroke();

    gridCtx.font = 'bold 16px sans-serif';
    gridCtx.textAlign = 'center';
    gridCtx.textBaseline = 'middle';
    
    state.selectedGridCells.forEach((data, cellKey) => {
        const [lon, lat] = cellKey.split('-').map(Number);
        const p1 = state.map.getPixelFromCoordinate(ol.proj.fromLonLat([lon, lat]));
        const p2 = state.map.getPixelFromCoordinate(ol.proj.fromLonLat([lon + GRID_INTERVAL, lat + GRID_INTERVAL]));
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

    if (state.lockedCenterForEditing) {
        const pixel = state.map.getPixelFromCoordinate(state.lockedCenterForEditing);
        if (pixel) {
            gridCtx.beginPath();
            gridCtx.arc(pixel[0], pixel[1], 8, 0, 2 * Math.PI, false);
            gridCtx.fillStyle = 'rgba(239, 68, 68, 0.9)';
            gridCtx.fill();
            gridCtx.lineWidth = 2;
            gridCtx.strokeStyle = 'white';
            gridCtx.stroke();
        }
    }
}

function paintCell(evt) {
    if (state.currentAreaTool === 'pan') return;

    const coord = state.map.getCoordinateFromPixel(evt.pixel);
    if (!coord) return;
    const [lon, lat] = ol.proj.toLonLat(coord);
    
    const snappedLon = Math.floor(lon / GRID_INTERVAL) * GRID_INTERVAL;
    const snappedLat = Math.floor(lat / GRID_INTERVAL) * GRID_INTERVAL;
    const cellKey = `${snappedLon.toFixed(GRID_PRECISION)}-${snappedLat.toFixed(GRID_PRECISION)}`;
    
    if (cellKey === state.lastPaintedCellKey) return;
    state.lastPaintedCellKey = cellKey;

    const centerCoords = state.lockedCenterForEditing || (state.tempMarker ? state.tempMarker.getPosition() : state.map.getView().getCenter());
    if (ol.sphere.getDistance(ol.proj.toLonLat(centerCoords), [snappedLon, snappedLat]) > GRID_DRAW_RADIUS) return;

    const existingData = state.selectedGridCells.get(cellKey);
    const tool = state.currentAreaTool;

    if (tool === 'fill') {
        if (existingData && existingData.fillColor) {
            delete existingData.fillColor;
            if (!existingData.marker) state.selectedGridCells.delete(cellKey);
        } else {
            const newData = existingData || {};
            newData.fillColor = state.currentAreaColor;
            state.selectedGridCells.set(cellKey, newData);
        }
    } else if (tool === 'eraser') {
        state.selectedGridCells.delete(cellKey);
    } else { // Marker tools
        const newData = existingData || {};
        newData.marker = newData.marker === tool ? null : tool;
        if (newData.marker) newData.markerColor = state.currentMarkerColor;
        
        if (!newData.fillColor && !newData.marker) state.selectedGridCells.delete(cellKey);
        else state.selectedGridCells.set(cellKey, newData);
    }
    drawGrid();
}

export function toggleAreaSelectionMode(enable, areaBoundsToLoad = null) {
    state.isAreaSelectionMode = enable;
    
    $('#grid-color-palette, #mobile-grid-submit-btn').toggleClass('hidden', !enable);
    $('#grid-toolbar').toggleClass('hidden', !enable).toggleClass('flex', enable);

    if (enable) {
        const zoomThreshold = state.isMobile ? GRID_ZOOM_LEVEL_MOBILE : GRID_ZOOM_LEVEL_WEB;
        state.map.getView().animate({ zoom: zoomThreshold, duration: 800 });
        $('#map').addClass('map-enhanced grid-mode-active paint-mode');
        
        if (state.dragPanInteraction) state.dragPanInteraction.setActive(false);
        $('#location-instruction').text('請在地圖上的網格標示範圍。');
        $('#desktop-center-marker').addClass('hidden');
        if (state.tempMarker) state.tempMarker.getElement().style.display = 'none';
        
        if (state.isMobile) {
            state.cachedActionButtons = $('#main-action-buttons').detach();
            $('#add-location-modal-mobile').addClass('minimized');
            $('#restore-mobile-modal-btn').removeClass('hidden');
        }
        
        state.selectedGridCells.clear();
        if (areaBoundsToLoad) {
            try {
                const data = JSON.parse(areaBoundsToLoad);
                let cellsToLoad = (data.v === 1) 
                    ? data.c.map(cellStr => {
                        const [coords, fillIdx, markerChar, markerColorIdx] = cellStr.split(':');
                        const [x, y] = coords.split(',').map(Number);
                        const lon = parseFloat(data.o[0]) + x * GRID_INTERVAL;
                        const lat = parseFloat(data.o[1]) + y * GRID_INTERVAL;
                        const cellData = {};
                        if (fillIdx) cellData.fillColor = data.p.f[parseInt(fillIdx)];
                        if (markerChar) cellData.marker = {e:'entrance',x:'exit',t:'table',p:'parking'}[markerChar];
                        if (markerColorIdx) cellData.markerColor = data.p.m[parseInt(markerColorIdx)];
                        return { key: `${lon.toFixed(GRID_PRECISION)}-${lat.toFixed(GRID_PRECISION)}`, data: cellData };
                    })
                    : data.map(cell => ({ key: `${cell.lon.toFixed(GRID_PRECISION)}-${cell.lat.toFixed(GRID_PRECISION)}`, data: {fillColor: cell.fillColor, marker: cell.marker, markerColor: cell.markerColor} }));
                
                cellsToLoad.forEach(item => state.selectedGridCells.set(item.key, item.data));
            } catch (e) {
                console.error("Failed to load area bounds:", e);
                showNotification('讀取建築範圍資料失敗！', 'error');
            }
        }
        
        $('#grid-canvas').removeClass('hidden');
        drawGrid();
        state.map.on('moveend', drawGrid);
        state.map.on('pointerdown', mapPointerDown);
    } else {
        $('#map').removeClass('map-enhanced grid-mode-active paint-mode pan-mode');
        if (state.dragPanInteraction) state.dragPanInteraction.setActive(true);
        if (state.tempMarker) state.tempMarker.getElement().style.display = 'block';
        if (state.isMobile && state.cachedActionButtons) {
            $('#map-container').append(state.cachedActionButtons);
            state.cachedActionButtons = null;
        }
        $('#desktop-center-marker').removeClass('hidden');
        $('#location-instruction').text('請移動地圖中心點來選擇位置。');
        $('#grid-canvas').addClass('hidden');
        gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        state.map.un('moveend', drawGrid);
        state.map.un('pointerdown', mapPointerDown);
    }
}

const mapPointerDown = (evt) => {
    if (evt.originalEvent.button !== 0 || !state.isAreaSelectionMode || state.currentAreaTool === 'pan') return;
    state.isDrawingOnGrid = true;
    paintCell(evt);
    state.map.on('pointermove', mapPointerMove);
    state.map.getViewport().addEventListener('pointerup', mapPointerUp, { once: true });
};
const mapPointerMove = (evt) => { if (state.isDrawingOnGrid) paintCell(evt); };
const mapPointerUp = () => {
    state.isDrawingOnGrid = false;
    state.lastPaintedCellKey = null;
    state.map.un('pointermove', mapPointerMove);
};

function setupGridToolbar() {
    $('#palette-fill-color').on('input', function() { state.currentAreaColor = $(this).val(); });
    $('#palette-marker-color').on('input', function() { state.currentMarkerColor = $(this).val(); });
    $('.grid-tool-btn').on('click', function() {
        $('.grid-tool-btn').removeClass('active');
        $(this).addClass('active');
        state.currentAreaTool = $(this).attr('id').replace('tool-', '');
        const isPan = state.currentAreaTool === 'pan';
        if (state.dragPanInteraction) state.dragPanInteraction.setActive(isPan);
        $('#map').toggleClass('pan-mode', isPan).toggleClass('paint-mode', !isPan);
    });
}

export function initializeGrid() {
    gridCanvas = document.getElementById('grid-canvas');
    gridCtx = gridCanvas.getContext('2d');
    setupGridToolbar();
}
