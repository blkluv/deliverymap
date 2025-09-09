/**
 * @file 處理所有與 OpenLayers 地圖相關的初始化與操作。
 */
import { mapIcons, categoryColors, clusterColorPalette, LABEL_VISIBILITY_ZOOM } from './config.js';

// --- 全域變數 ---
export let map = null;
export let vectorSource = null;
export let clusterSource = null;
export let areaGridSource = null;
export let radiusSource = null;
export let infoOverlay = null;
export let userLocationOverlay = null;
export let dragPanInteraction = null;

let osmLayer, areaGridLayer, lineLayer, radiusLayer, clusterLayer;
const styleCache = {};
const isMobile = window.innerWidth < 768;

/**
 * 初始化地圖
 * @param {ol.Coordinate} centerCoords - 地圖中心點座標
 * @param {number} zoomLevel - 地圖縮放層級
 */
export function initMap(centerCoords, zoomLevel) {
    // --- 圖層定義 ---
    osmLayer = new ol.layer.Tile({
        source: new ol.source.OSM({
             attributions: '內容為外送員分享經驗 | 地圖資料 &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap',
        }),
        zIndex: 0
    });

    areaGridSource = new ol.source.Vector();
    areaGridLayer = new ol.layer.Vector({
        source: areaGridSource,
        style: (feature) => feature.getStyle(),
        zIndex: 1
    });

    vectorSource = new ol.source.Vector();
    clusterSource = new ol.source.Cluster({ 
        distance: 50, 
        minDistance: 25, 
        source: vectorSource 
    });

    const lineSource = new ol.source.Vector();
    lineLayer = new ol.layer.Vector({
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

    radiusSource = new ol.source.Vector();
    radiusLayer = new ol.layer.Vector({
        source: radiusSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(59, 130, 246, 0.1)' }),
            stroke: new ol.style.Stroke({ color: 'rgba(59, 130, 246, 0.8)', width: 2 }),
        }),
        zIndex: 2
    });

    clusterLayer = new ol.layer.Vector({ 
        source: clusterSource, 
        style: clusterStyleFunction,
        zIndex: 3
    });

    const taiwanExtent = ol.proj.transformExtent([118.0, 21.5, 122.5, 25.5], 'EPSG:4326', 'EPSG:3857');

    map = new ol.Map({
        target: 'map', 
        layers: [osmLayer, areaGridLayer, lineLayer, radiusLayer, clusterLayer],
        view: new ol.View({ 
            center: centerCoords, 
            zoom: zoomLevel,
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
    infoOverlay = new ol.Overlay({
        element: document.getElementById('popup'),
        autoPan: { animation: { duration: 250 } },
    });
    map.addOverlay(infoOverlay);

    userLocationOverlay = new ol.Overlay({ 
        element: document.getElementById('user-location'), 
        positioning: 'center-center', 
        stopEvent: false 
    });
    map.addOverlay(userLocationOverlay);
}


// --- 樣式與繪圖函式 ---

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

