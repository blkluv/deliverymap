// 後端 API 網址
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw93ckEaMhqOmcrsGiMFY3gkxQVLDlKItY_O-xmEaswKibQ8YlscrVjHuB2viTV0XZg/exec';
export const CHAT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzr_Xmv4WeUCDOjpZmXdHLwtWg4kAOhcMB0brJQWkzquFqOLjupnFcB7AvdQM022dqWrQ/exec';

// Google API 金鑰 (用於地理編碼)
export const GOOGLE_API_KEY = "AIzaSyBa9P8XeaoUPUXPqMm8m6NHawZKFpCePqE";
export const GOOGLE_CLIENT_ID = '35839698842-b73h9naufqdm7d0j378882k1e6aq6064.apps.googleusercontent.com';

// LIFF ID
export const LIFF_ID = '2008020548-lVYKgg0B';

// WebSocket URL
export const WEBSOCKET_URL = 'wss://deliverymap.onrender.com/';

// Local Storage Keys
export const VOTES_STORAGE_KEY = 'userBlacklistVotes';
export const SESSION_TOKEN_KEY = 'userSessionToken';

// 地圖分類與樣式設定
export const categoryColors = {
    '透天厝': 'rgba(1, 196, 106, 1)',
    '公寓大廈': 'rgba(247, 41, 128, 1)',
    '辦公室': 'rgba(59, 130, 246, 1)',
    '飯店': 'rgba(139, 92, 246, 1)',
    '其他': 'rgba(107, 114, 128, 1)',
};
export const allCategories = ['透天厝', '公寓大廈', '辦公室', '飯店', '其他'];

// 地圖圖示 (SVG)
const createIconSvg = (color, path, isCircle = true) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28px" height="28px">${isCircle ? `<circle cx="12" cy="12" r="11" fill="${color}" stroke="white" stroke-width="1.5"/>` : ''}${path}</svg>`)}`;
export const mapIcons = {
    '透天厝': createIconSvg(categoryColors['透天厝'], '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="white"/>'),
    '公寓大廈': createIconSvg(categoryColors['公寓大廈'], '<g transform="scale(0.7) translate(5.5, 3.5)"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" fill="none" stroke-width="1.8" stroke="white"/></g>'),
    '辦公室': createIconSvg(categoryColors['辦公室'], '<g transform="scale(0.7) translate(5.2, 3.5)"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" fill="white"/></g>'),
    '飯店': createIconSvg(categoryColors['飯店'], '<g transform="scale(0.7) translate(5.2, 3.5)"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2V7c0-2.21-1.79-4-4-4z" fill="white"/></g>'),
    '其他': createIconSvg(categoryColors['其他'], '<circle cx="12" cy="12" r="2" fill="white"/>'),
};
export const legendIcons = {
    '透天厝': createIconSvg(categoryColors['透天厝'], `<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="${categoryColors['透天厝']}"/>`, false),
    '公寓大廈': createIconSvg(categoryColors['公寓大廈'], `<g transform="scale(0.9) translate(1.5, 1.5)"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" fill="none" stroke-width="1.5" stroke="${categoryColors['公寓大廈']}"/></g>`, false),
    '辦公室': createIconSvg(categoryColors['辦公室'], `<path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" fill="${categoryColors['辦公室']}"/>`, false),
    '飯店': createIconSvg(categoryColors['飯店'], `<path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2V7c0-2.21-1.79-4-4-4z" fill="${categoryColors['飯店']}"/>`, false),
    '其他': createIconSvg(categoryColors['其他'], `<circle cx="12" cy="12" r="8" fill="${categoryColors['其他']}"/>`, false)
};

export const clusterColorPalette = [
    'rgba(2, 132, 199, 0.8)', 'rgba(217, 70, 239, 0.8)', 'rgba(249, 115, 22, 0.8)',
    'rgba(132, 204, 22, 0.8)', 'rgba(168, 85, 247, 0.8)', 'rgba(239, 68, 68, 0.8)',
];

// 網格繪圖設定
export const GRID_INTERVAL = 0.000033;
export const GRID_PRECISION = 6;
export const GRID_DRAW_RADIUS = 5000;
export const GRID_ZOOM_LEVEL_WEB = 20;
export const GRID_ZOOM_LEVEL_MOBILE = 19;

// 地圖顯示設定
export const LABEL_VISIBILITY_ZOOM = 17;
export const MAP_FILTER_CONTRAST = 1;
export const MAP_FILTER_SATURATE = 1;
export const MAP_FILTER_BRIGHTNESS = 1;
