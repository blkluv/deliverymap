/**
 * @file 處理所有與 OpenLayers 地圖相關的初始化與操作。
 */
import { mapIcons, categoryColors, clusterColorPalette, LABEL_VISIBILITY_ZOOM } from './config.js';

// --- IndexedDB 地圖圖磚快取 ---
const DB_NAME = 'osm_tile_cache';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';
let db = null;

/**
 * 初始化 IndexedDB 以快取地圖圖磚。
 */
function initTileCacheDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
        const dbInstance = event.target.result;
        if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
            dbInstance.createObjectStore(STORE_NAME);
        }
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        console.log('地圖圖磚快取資料庫初始化成功。');
    };

    request.onerror = (event) => {
        console.error('初始化地圖快取資料庫失敗:', event.target.errorCode);
    };
}

/**
 * 從網路獲取圖磚，顯示它，並將其存入 IndexedDB 快取。
 * @param {ol.Tile} tile 要載入的圖磚。
 * @param {string} src 圖磚圖片的 URL。
 */
function fetchAndCacheTile(tile, src) {
    const image = tile.getImage();
    fetch(src)
        .then(response => {
            if (!response.ok) {
                throw new Error(`獲取圖磚失敗: ${response.statusText}`);
            }
            return response.blob();
        })
        .then(blob => {
            const objectURL = URL.createObjectURL(blob);
            image.src = objectURL;
            image.onload = () => {
                URL.revokeObjectURL(objectURL);
            };

            if (db) {
                blob.arrayBuffer().then(arrayBuffer => {
                     const transaction = db.transaction([STORE_NAME], 'readwrite');
                     const store = transaction.objectStore(STORE_NAME);
                     const tileData = {
                         timestamp: Date.now(),
                         type: blob.type,
                         data: arrayBuffer
                     };
                     store.put(tileData, src);
                });
            }
        })
        .catch(error => {
            console.error(`獲取圖磚 ${src} 錯誤:`, error);
            tile.setState(3); // ol.TileState.ERROR
        });
}

/**
 * 自訂的圖磚載入函式，使用 IndexedDB 作為快取。
 * @param {ol.Tile} tile 要載入的圖磚。
 * @param {string} src 圖磚圖片的 URL。
 */
const customTileLoadFunction = (tile, src) => {
    const image = tile.getImage();

    if (!db) {
        image.src = src;
        return;
    }

    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(src);

    request.onsuccess = (event) => {
        const result = event.target.result;
        if (result && result.data) {
            try {
                const blob = new Blob([result.data], { type: result.type });
                const objectURL = URL.createObjectURL(blob);
                image.src = objectURL;
                image.onload = () => {
                    URL.revokeObjectURL(objectURL);
                };
            } catch (e) {
                console.error("從快取建立 blob 失敗:", e);
                fetchAndCacheTile(tile, src);
            }
        } else {
            fetchAndCacheTile(tile, src);
        }
    };

    request.onerror = (event) => {
        console.error('讀取圖磚快取失敗:', event.target.errorCode);
        fetchAndCacheTile(tile, src);
    };
};

// 在模組載入時立即初始化資料庫
initTileCacheDB();

// --- OpenLayers 元件與圖層 ---
const styleCache = {};
export let dragPanInteraction = null;
const isMobile = window.innerWidth < 768;

const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM({
         attributions: '內容為外送員分享經驗 | 地圖資料 &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap',
         tileLoadFunction: customTileLoadFunction,
    }),
    zIndex: 0
});

export const areaGridSource = new ol.source.Vector();
export const areaGridLayer = new ol.layer.Vector({
    source: areaGridSource,
    style: (feature) => feature.getStyle(),
    zIndex: 1
});

export const vectorSource = new ol.source.Vector();
export const clusterSource = new ol.source.Cluster({ 
    distance: 50, 
    minDistance: 25, 
    source: vectorSource 
});

const lineSource = new ol.source.Vector();
const lineLayer = new ol.layer.Vector({
    source: lineSource,
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: 'rgba(50, 50, 50, 0.7)',
            width: 1.5,
            lineDash: [4, 4]
        })
    }),
    zIndex: 2
});

export const radiusSource = new ol.source.Vector();
const radiusLayer = new ol.layer.Vector({
    source: radiusSource,
    style: new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(59, 130, 246, 0.1)' }),
        stroke: new ol.style.Stroke({ color: 'rgba(59, 130, 246, 0.8)', width: 2 }),
    }),
    zIndex: 2
});

function formatAddress(address) {
    if (!address) return '';
    const match = address.match(/([^縣市區鄉鎮鎮]+(?:路|街|大道|巷|村|里).*)/);
    return match ? match[1] : address;
}

function clusterStyleFunction(feature) {
    const features = feature.get('features');
    const size = features.length;
    
    if (size > 1) {
        const styleKey = `cluster_${size}`;
        if (!styleCache[styleKey]) {
            const colorIndex = (size * 5) % clusterColorPalette.length;
            const color = clusterColorPalette[colorIndex];
            styleCache[styleKey] = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 12 + Math.min(size, 20),
                    fill: new ol.style.Fill({ color }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
                }),
                text: new ol.style.Text({ 
                    text: size.toString(), 
                    fill: new ol.style.Fill({ color: '#fff' }), 
                    font: 'bold 12px sans-serif' 
                }),
            });
        }
        return styleCache[styleKey];
    } else {
        const originalFeature = features[0];
        const category = originalFeature.get('category') || '其他';
        const singleStyleKey = `single_${category}`;
        
        if (!styleCache[singleStyleKey]) {
             styleCache[singleStyleKey] = new ol.style.Style({
                image: new ol.style.Icon({
                    src: mapIcons[category] || mapIcons['其他'],
                    scale: 1,
                    anchor: [0.5, 1],
                })
            });
        }

        const clonedStyle = styleCache[singleStyleKey].clone();
        if (map.getView().getResolution() <= 50) {
            const shortAddress = formatAddress(originalFeature.get('address'));
            clonedStyle.setText(new ol.style.Text({
                text: shortAddress, 
                font: 'bold 13px sans-serif', 
                fill: new ol.style.Fill({ color: '#333' }),
                backgroundFill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.85)' }),
                backgroundStroke: new ol.style.Stroke({ color: categoryColors[category] || categoryColors['其他'], width: 1 }),
                padding: [5, 7, 5, 7], 
                offsetY: 8,
                overflow: true,
            }));
        }
        return clonedStyle;
    }
}

const clusterLayer = new ol.layer.Vector({ 
    source: clusterSource, 
    style: clusterStyleFunction,
    zIndex: 3
});

const taiwanExtent = ol.proj.transformExtent([118.0, 21.5, 122.5, 25.5], 'EPSG:4326', 'EPSG:3857');

export const map = new ol.Map({
    target: 'map', 
    layers: [osmLayer, areaGridLayer, lineLayer, radiusLayer, clusterLayer],
    view: new ol.View({ 
        center: ol.proj.fromLonLat([120.9, 23.9]), 
        zoom: 8,
        extent: taiwanExtent,
        minZoom: 8,
        enableRotation: !isMobile,
    }),
    controls: [
        new ol.control.Zoom(),
        new ol.control.Attribution({
            collapsible: false
        })
    ].concat(isMobile ? [] : [new ol.control.Rotate()]),
});

map.getInteractions().forEach(interaction => {
    if (interaction instanceof ol.interaction.DragPan) {
        dragPanInteraction = interaction;
    }
});


// --- Overlays ---
export const infoOverlay = new ol.Overlay({
    element: document.getElementById('popup'),
    autoPan: { animation: { duration: 250 } },
});
map.addOverlay(infoOverlay);

export const userLocationOverlay = new ol.Overlay({ 
    element: document.getElementById('user-location'), 
    positioning: 'center-center', 
    stopEvent: false 
});
map.addOverlay(userLocationOverlay);

// --- 地圖繪製函式 ---

/**
 * 在地圖上繪製所有已審核的社區/建築範圍。
 * @param {Array} areas - 社區/建築的資料陣列。
 */
export function drawCommunityAreas(areas) {
    areas.forEach(areaData => {
        if (String(areaData['審核']).toUpperCase() !== 'TRUE' || !areaData.areaBounds) return;

        try {
            const boundsData = JSON.parse(areaData.areaBounds);
            let cellsToDraw;

            if (boundsData.v === 1) { // v1 壓縮格式
                const { o: originCoords, p: palette, c: compressedCells } = boundsData;
                const origin = { lon: parseFloat(originCoords[0]), lat: parseFloat(originCoords[1]) };
                const markerReverseMap = { 'e': 'entrance', 'x': 'exit', 't': 'table', 'p': 'parking' };
                
                cellsToDraw = compressedCells.map(cellStr => {
                    const [coords, fillIdx, markerChar, markerColorIdx] = cellStr.split(':');
                    const [x, y] = coords.split(',').map(Number);
                    const lon = origin.lon + x * 0.000033;
                    const lat = origin.lat + y * 0.000033;
                    
                    return {
                        lon, lat,
                        fillColor: fillIdx !== '' ? palette.f[parseInt(fillIdx, 10)] : null,
                        marker: markerChar !== '' ? markerReverseMap[markerChar] : null,
                        markerColor: markerColorIdx !== '' ? palette.m[parseInt(markerColorIdx, 10)] : null,
                    };
                });
            } else { // 舊版格式
                cellsToDraw = boundsData;
            }

            if (!Array.isArray(cellsToDraw)) return;
            
            let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;

            cellsToDraw.forEach(cell => {
                const { lon, lat, marker, markerColor, fillColor } = cell;
                const extent = ol.proj.transformExtent(
                    [lon, lat, lon + 0.000033, lat + 0.000033],
                    'EPSG:4326', 'EPSG:3857'
                );
                
                minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon + 0.000033);
                minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat + 0.000033);
                
                const cellFeature = new ol.Feature({
                    geometry: ol.geom.Polygon.fromExtent(extent),
                    parentData: areaData
                });

                cellFeature.setStyle((feature, resolution) => {
                    const zoom = map.getView().getZoomForResolution(resolution);
                    const styles = [];
                    if (fillColor) styles.push(new ol.style.Style({ fill: new ol.style.Fill({ color: fillColor }) }));
                    if (marker && zoom >= LABEL_VISIBILITY_ZOOM) {
                        const markerText = { 'entrance': '入', 'exit': '出', 'table': '桌', 'parking': '停' }[marker];
                        styles.push(new ol.style.Style({
                            text: new ol.style.Text({
                                text: markerText, font: 'bold 14px sans-serif',
                                fill: new ol.style.Fill({ color: markerColor || '#000' }),
                                backgroundFill: new ol.style.Fill({ color: 'rgba(255,255,255,0.7)'}),
                                padding: [2, 2, 2, 2]
                            })
                        }));
                    }
                    return styles;
                });
                areaGridSource.addFeature(cellFeature);
            });
            
            if (areaData.areaName) {
                const centerLon = minLon + (maxLon - minLon) / 2;
                const centerLat = minLat + (maxLat - minLat) / 2;
                const nameFeature = new ol.Feature({
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([centerLon, centerLat])),
                    parentData: areaData
                });
                 nameFeature.setStyle((feature, resolution) => {
                    if (map.getView().getZoomForResolution(resolution) >= LABEL_VISIBILITY_ZOOM) {
                        return new ol.style.Style({
                            text: new ol.style.Text({
                                text: areaData.areaName, font: 'bold 16px sans-serif',
                                fill: new ol.style.Fill({ color: '#333' }),
                                backgroundFill: new ol.style.Fill({ color: 'rgba(255,255,255,0.8)'}),
                                padding: [5, 8, 5, 8], overflow: true
                            })
                        });
                    }
                    return null;
                });
                 areaGridSource.addFeature(nameFeature);
            }

        } catch(e) {
            console.error("繪製社區範圍失敗:", areaData.areaBounds, e);
        }
    });
}
