// 這個檔案用來存放整個應用程式需要共享的狀態變數
export const state = {
    // OpenLayers instances
    map: null,
    vectorSource: null,
    clusterSource: null,
    areaGridSource: null,
    radiusSource: null,
    lineSource: null,
    infoOverlay: null,
    userLocationOverlay: null,
    dragPanInteraction: null,
    styleCache: {},

    // Auth & User state
    isLoggedIn: false,
    userProfile: {},
    isAdmin: false,
    currentUserDisplayName: '',
    currentUserCity: '未知區域',
    isLocationKnown: false,
    userVotes: {},
    userPositionCoords: null, // ol.Coordinate

    // App Data
    rawReports: [],
    allFeatures: [],
    fuse: null,
    
    // WebSocket & Chat
    ws: null,
    unreadChatCount: 0,
    isChatHistoryLoaded: false,
    contextMenuTarget: { userId: null, userName: null },
    
    // UI/Mode State
    isMobile: window.innerWidth < 768,
    cachedActionButtons: null,
    currentFeatureData: null, // For popup
    
    // Add/Edit Location State
    initialAddLocationCoords: null,
    tempMarker: null,
    isDraggingMarker: false,
    latestGeocodeBounds: null,
    areaBoundsForEditing: null,
    lockedCenterForEditing: null,
    
    // Grid Drawing State
    isAreaSelectionMode: false,
    selectedGridCells: new Map(),
    currentAreaColor: 'rgba(239, 68, 68, 0.7)',
    currentMarkerColor: '#000000',
    currentAreaTool: 'fill',
    isDrawingOnGrid: false,
    lastPaintedCellKey: null,

    // Modal Map instances
    reviewMapInstance: null,
    managementAreaMaps: {},
};
