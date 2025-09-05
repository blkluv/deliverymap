import { state } from './state.js';
import { mapIcons, categoryColors } from './config.js';

let styleCache = {};

// 聚合圖示樣式函式
function clusterStyleFunction(feature) {
    const features = feature.get('features');
    const size = features.length;
    
    if (size > 1) {
        const styleKey = `cluster_${size}`;
        if (!styleCache[styleKey]) {
            const clusterColor = `rgba(2, 132, 199, 0.8)`; // Example color
            styleCache[styleKey] = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 12 + Math.min(size, 20),
                    fill: new ol.style.Fill({ color: clusterColor }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
                }),
                text: new ol.style.Text({ text: size.toString(), fill: new ol.style.Fill({ color: '#fff' }), font: 'bold 12px sans-serif' }),
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
        return styleCache[singleStyleKey];
    }
}

// 初始化地圖
export function initializeMap() {
    const osmLayer = new ol.layer.Tile({
        source: new ol.source.OSM({
             attributions: '內容為外送員分享經驗 | 地圖資料 &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
        }),
        zIndex: 0
    });
    
    const areaGridSource = new ol.source.Vector();
    const areaGridLayer = new ol.layer.Vector({
        source: areaGridSource,
        style: (feature) => feature.getStyle(),
        zIndex: 1
    });

    const vectorSource = new ol.source.Vector();
    state.vectorSource = vectorSource; // 將 source 存到 state
    const clusterSource = new ol.source.Cluster({ distance: 50, minDistance: 25, source: vectorSource });
    state.clusterSource = clusterSource;

    const clusterLayer = new ol.layer.Vector({ 
        source: clusterSource, 
        style: clusterStyleFunction,
        zIndex: 3 
    });
    
    const taiwanExtent = ol.proj.transformExtent([118.0, 21.5, 122.5, 25.5], 'EPSG:4326', 'EPSG:3857');

    const map = new ol.Map({
        target: 'map', 
        layers: [osmLayer, areaGridLayer, clusterLayer],
        interactions: ol.interaction.defaults({
            doubleClickZoom: false,
        }),
        view: new ol.View({ 
            center: ol.proj.fromLonLat([120.9, 23.9]), 
            zoom: 8,
            extent: taiwanExtent,
            minZoom: 8,
        }),
        controls: ol.control.defaults.defaults({
            attributionOptions: { collapsible: false }
        }).extend([
            new ol.control.Zoom(),
            new ol.control.Rotate()
        ])
    });

    // 建立並加入 Overlays
    const popupContainer = document.getElementById('popup');
    const infoOverlay = new ol.Overlay({
        element: popupContainer,
        autoPan: { animation: { duration: 250 } },
    });
    map.addOverlay(infoOverlay);
    state.infoOverlay = infoOverlay;

    const userLocationElement = document.getElementById('user-location');
    const userLocationOverlay = new ol.Overlay({ element: userLocationElement, positioning: 'center-center', stopEvent: false });
    map.addOverlay(userLocationOverlay);
    state.userLocationOverlay = userLocationOverlay;

    state.map = map;
    state.areaGridSource = areaGridSource;
    return map;
}
