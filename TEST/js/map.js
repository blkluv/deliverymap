import { state } from './state.js';
import { mapIcons, categoryColors, LABEL_VISIBILITY_ZOOM, GRID_INTERVAL } from './config.js';
import { clusterColorPalette } from './config.js';

/**
 * 格式化地址，只顯示路名之後的部分
 * @param {string} address - 完整地址
 * @returns {string} 格式化後的地址
 */
export function formatAddress(address) {
    if (!address) return '';
    const match = address.match(/([^縣市區鄉鎮鎮]+(?:路|街|大道|巷|村|里).*)/);
    return match ? match[1] : address;
}

/**
 * 聚合圖示的樣式函式
 * @param {ol.Feature} feature - 聚合後的 Feature
 * @returns {ol.style.Style}
 */
function clusterStyleFunction(feature) {
    const features = feature.get('features');
    const size = features.length;

    if (size > 1) {
        const styleKey = `cluster_${size}`;
        if (!state.styleCache[styleKey]) {
            const colorIndex = (size * 5) % clusterColorPalette.length;
            const clusterColor = clusterColorPalette[colorIndex];
            state.styleCache[styleKey] = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 12 + Math.min(size, 20),
                    fill: new ol.style.Fill({ color: clusterColor }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
                }),
                text: new ol.style.Text({ text: size.toString(), fill: new ol.style.Fill({ color: '#fff' }), font: 'bold 12px sans-serif' }),
            });
        }
        return state.styleCache[styleKey];
    } else {
        const originalFeature = features[0];
        const category = originalFeature.get('category') || '其他';
        const singleStyleKey = `single_${category}`;

        if (!state.styleCache[singleStyleKey]) {
            state.styleCache[singleStyleKey] = new ol.style.Style({
                image: new ol.style.Icon({
                    src: mapIcons[category] || mapIcons['其他'],
                    scale: 1,
                    anchor: [0.5, 1],
                })
            });
        }

        const clonedStyle = state.styleCache[singleStyleKey].clone();
        const resolution = state.map.getView().getResolution();

        if (resolution <= 50) {
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
 * 初始化 OpenLayers 地圖
 */
export function initializeMap() {
    const osmLayer = new ol.layer.Tile({
        source: new ol.source.OSM({
            attributions: '內容為外送員分享經驗 | 地圖資料 &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
        }),
        zIndex: 0
    });

    state.areaGridSource = new ol.source.Vector();
    const areaGridLayer = new ol.layer.Vector({
        source: state.areaGridSource,
        style: (feature) => feature.getStyle(),
        zIndex: 1
    });

    state.vectorSource = new ol.source.Vector();
    state.clusterSource = new ol.source.Cluster({ distance: 50, minDistance: 25, source: state.vectorSource });

    const clusterLayer = new ol.layer.Vector({
        source: state.clusterSource,
        style: clusterStyleFunction,
        zIndex: 3
    });
    
    state.lineSource = new ol.source.Vector();
    const lineLayer = new ol.layer.Vector({
        source: state.lineSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(50, 50, 50, 0.7)', width: 1.5, lineDash: [4, 4] })
        }),
        zIndex: 2
    });

    state.radiusSource = new ol.source.Vector();
    const radiusLayer = new ol.layer.Vector({
        source: state.radiusSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(59, 130, 246, 0.1)' }),
            stroke: new ol.style.Stroke({ color: 'rgba(59, 130, 246, 0.8)', width: 2 }),
        }),
        zIndex: 2
    });

    const taiwanExtent = ol.proj.transformExtent([118.0, 21.5, 122.5, 25.5], 'EPSG:4326', 'EPSG:3857');

    const map = new ol.Map({
        target: 'map',
        layers: [osmLayer, areaGridLayer, lineLayer, radiusLayer, clusterLayer],
        interactions: ol.interaction.defaults({ doubleClickZoom: false }),
        view: new ol.View({
            center: ol.proj.fromLonLat([120.9, 23.9]),
            zoom: 8,
            extent: taiwanExtent,
            minZoom: 8,
        }),
        controls: [
            new ol.control.Zoom(),
            new ol.control.Rotate(),
            new ol.control.Attribution({ collapsible: false })
        ]
    });

    state.map = map;

    // 建立並加入 Overlays
    state.infoOverlay = new ol.Overlay({
        element: document.getElementById('popup'),
        autoPan: { animation: { duration: 250 } },
    });
    map.addOverlay(state.infoOverlay);

    state.userLocationOverlay = new ol.Overlay({ 
        element: document.getElementById('user-location'), 
        positioning: 'center-center', 
        stopEvent: false 
    });
    map.addOverlay(state.userLocationOverlay);
    
    map.getInteractions().forEach(interaction => {
        if (interaction instanceof ol.interaction.DragPan) {
            state.dragPanInteraction = interaction;
        }
    });

    console.log("Map initialized");
}
