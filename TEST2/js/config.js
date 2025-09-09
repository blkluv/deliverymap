/**
 * @file 存放應用程式的所有設定檔，如 API 金鑰、顏色、圖示等。
 */

// --- API & URLs ---
export const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx0-uzkARiULYBfpixUWGciCTWWVFjd_RwSjnqIunKONP-qXSf_PyxsmJTJbUCPu3Yirg/exec';
export const CHAT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzr_Xmv4WeUCDOjpZmXdHLwtWg4kAOhcMB0brJQWkzquFqOLjupnFcB7AvdQM022dqWrQ/exec';
export const GOOGLE_API_KEY = "AIzaSyBa9P8XeaoUPUXPqMm8m6NHawZKFpCePqE";
export const WEBSOCKET_URL = 'wss://deliverymap.onrender.com/';
export const SESSION_TOKEN_KEY = 'userSessionToken'; // 修正：新增此行

// --- Map Settings ---
export const MAP_FILTER_CONTRAST = 1;
export const MAP_FILTER_SATURATE = 1;
export const MAP_FILTER_BRIGHTNESS = 1;
export const LABEL_VISIBILITY_ZOOM = 17;

// --- Categories & Colors ---
export const categoryColors = {
    '透天厝': 'rgba(1, 196, 106, 1)',
    '公寓大廈': 'rgba(247, 41, 128, 1)',
    '辦公室': 'rgba(59, 130, 246, 1)',
    '飯店': 'rgba(139, 92, 246, 1)',
    '其他': 'rgba(107, 114, 128, 1)',
};
export const allCategories = ['透天厝', '公寓大廈', '辦公室', '飯店', '其他'];
export const clusterColorPalette = [
    'rgba(2, 132, 199, 0.8)', 'rgba(217, 70, 239, 0.8)', 'rgba(249, 115, 22, 0.8)',
    'rgba(132, 204, 22, 0.8)', 'rgba(168, 85, 247, 0.8)', 'rgba(239, 68, 68, 0.8)',
];

// --- Icons ---
export const mapIcons = {
    '透天厝': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28px" height="28px"><circle cx="12" cy="12" r="11" fill="${categoryColors['透天厝']}" stroke="white" stroke-width="1.5"/><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="white"/></svg>`)}`,
    '公寓大廈': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28px" height="28px"><circle cx="12" cy="12" r="11" fill="${categoryColors['公寓大廈']}" stroke="white" stroke-width="1.5"/><g transform="scale(0.7) translate(5.5, 3.5)"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" fill="none" stroke-width="1.8" stroke="white"/></g></svg>`)}`,
    '辦公室': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28px" height="28px"><circle cx="12" cy="12" r="11" fill="${categoryColors['辦公室']}" stroke="white" stroke-width="1.5"/><g transform="scale(0.7) translate(5.2, 3.5)"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" fill="white"/></g></svg>`)}`,
    '飯店': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28px" height="28px"><circle cx="12" cy="12" r="11" fill="${categoryColors['飯店']}" stroke="white" stroke-width="1.5"/><g transform="scale(0.7) translate(5.2, 3.5)"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2V7c0-2.21-1.79-4-4-4z" fill="white"/></g></svg>`)}`,
    '其他': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28px" height="28px"><circle cx="12" cy="12" r="11" fill="${categoryColors['其他']}" stroke="white" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="white"/></svg>`)}`
};
export const legendIcons = {
    '透天厝': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${categoryColors['透天厝']}" width="28px" height="28px"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`)}`,
    '公寓大廈': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="${categoryColors['公寓大廈']}" width="28px" height="28px"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" /></svg>`)}`,
    '辦公室': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${categoryColors['辦公室']}" width="28px" height="28px"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>`)}`,
    '飯店': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${categoryColors['飯店']}" width="28px" height="28px"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2V7c0-2.21-1.79-4-4-4z"/></svg>`)}`,
    '其他': `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${categoryColors['其他']}" width="24px" height="24px"><circle cx="12" cy="12" r="8"/></svg>`)}`
};

// --- Grid Settings ---
export const GRID_INTERVAL = 0.000033;
export const GRID_PRECISION = 6;
export const GRID_DRAW_RADIUS = 5000; 
export const GRID_ZOOM_LEVEL_WEB = 20; 
export const GRID_ZOOM_LEVEL_MOBILE = 19;

