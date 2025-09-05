// 這個檔案用來存放整個應用程式需要共享的狀態變數

export const state = {
    map: null,
    isLoggedIn: false,
    userProfile: {},
    isAdmin: false,
    isMobile: window.innerWidth < 768,
    rawReports: [], // 從後端獲取的原始資料
    allFeatures: [], // 處理過的 OpenLayers Feature 物件
    fuse: null, // 用於模糊搜尋的 Fuse.js 實例
    ws: null, // WebSocket 連線實例
    
    // 用於新增/編輯模式的狀態
    tempMarker: null,
    isDraggingMarker: false,
    lockedCenterForEditing: null, // 在網格模式下鎖定的中心點
    
    // 用於網格繪圖的狀態
    isAreaSelectionMode: false,
    selectedGridCells: new Map(),
    currentAreaTool: 'fill',
    
    // 用於UI互動
    cachedActionButtons: null,
};
