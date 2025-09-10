<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>黑客指南針</title>
    
    <!-- LIFF SDK -->
    <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>

    <!-- Facebook Blocker Script -->
    <script>
        (function() {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.includes("fban") || ua.includes("fbav")) {
                document.addEventListener('DOMContentLoaded', () => {
                    const modal = document.getElementById('facebook-blocker-modal');
                    if (modal) {
                        modal.style.display = 'flex';
                    }
                });
            }
        })();
    </script>

    <!-- URL Cleaner Script -->
    <script>
        (function() {
            const url = new URL(window.location);
            if (url.searchParams.has('fbclid')) {
                window.history.replaceState({}, document.title, url.pathname + url.hash);
            }
        })();
    </script>
    
    <script>
        window.initialLocationPromise = new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.warn('您的瀏覽器不支援地理定位。');
                resolve({ lon: 121.5173, lat: 25.0479, zoom: 15, success: false });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lon: position.coords.longitude,
                        lat: position.coords.latitude,
                        zoom: 16,
                        success: true
                    });
                },
                () => {
                    console.warn('無法取得使用者位置。');
                    resolve({ lon: 121.5173, lat: 25.0479, zoom: 15, success: false });
                },
                {
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 0
                }
            );
        });
    </script>
    
    <!-- Libraries CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v9.2.4/ol.css">
    
    <!-- Custom CSS -->
    <link rel="stylesheet" href="css/styles.css">
    
    <!-- Libraries JS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://code.jquery.com/jquery-3.7.1.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/ol@v9.2.4/dist/ol.js"></script>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
    <script src="https://cdn.jsdelivr.net/npm/fuse.js@7.0.0"></script>
    <script src="https://unpkg.com/pinyin-pro@3.18.2/dist/index.js"></script>
    
    <!-- Inline Styles for Loading Screen & Chat -->
    <style>
        .chat-message-item {
            -webkit-user-select: none;
            -ms-user-select: none;
            user-select: none;
        }
        .loader {
            border-top-color: #3498db; /* Spinner active color */
            -webkit-animation: spinner 1.5s linear infinite;
            animation: spinner 1.5s linear infinite;
        }
        @-webkit-keyframes spinner {
            0% { -webkit-transform: rotate(0deg); }
            100% { -webkit-transform: rotate(360deg); }
        }
        @keyframes spinner {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="bg-gray-100">

    <!-- Loading Screen Overlay -->
    <div id="loading-overlay" class="fixed inset-0 bg-white z-[9999] flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out">
        <div class="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-24 w-24 mb-4"></div>
        <h2 class="text-center text-gray-700 text-xl font-semibold">🌎黑客指南針🧭</h2>
        <p class="w-2/3 md:w-1/3 text-center text-gray-500 mt-2">🛵🛵🛵初次載入或網路較慢時可能需要一些時間，請稍候。</p>
    </div>

    <div id="app" class="relative h-screen w-screen overflow-hidden">
        <!-- App Container -->
        <div id="app-container">
            <!-- 新增/編輯店家 Modal (Desktop Sidebar) -->
            <div id="add-location-modal" class="desktop-mode">
                <div class="bg-white shadow-2xl w-full h-full flex flex-col">
                    <form id="add-location-form" class="flex-grow flex flex-col overflow-hidden">
                        <div class="p-4 border-b flex justify-between items-center flex-shrink-0">
                            <h2 id="modal-title" class="text-xl font-bold text-gray-800">新增地點</h2>
                            <div class="flex items-center space-x-2">
                                 <button id="submit-location-btn" type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center w-28">
                                    <span class="submit-text">送出審核</span>
                                    <span class="spinner hidden animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                                 </button>
                                <button id="close-add-location-modal" type="button" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
                            </div>
                        </div>
                        <div class="px-6 pt-2 pb-16 space-y-4 overflow-y-auto custom-scrollbar flex-grow">
                            <input type="hidden" id="edit-row-index" name="rowIndex">
                            <input type="hidden" id="edit-area-row-index" name="areaRowIndex">
                            <input type="hidden" id="edit-original-name" name="originalName">
                            <p id="location-instruction" class="text-sm text-gray-600">請移動地圖中心點來選擇位置。</p>
                            <div class="hidden md:block">
                                <label class="block text-sm font-medium text-gray-700">社區/區域名稱</label>
                                <input type="text" id="add-area-name" name="areaName" class="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">地址 <span class="text-red-500">*</span></label>
                                <div id="address-input-container">
                                    <input type="text" id="add-address" name="address" class="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" required>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">類別 <span class="text-red-500">*</span></label>
                                <select id="add-category" name="category" class="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm" required></select>
                            </div>
                            <div class="hidden md:block">
                                <label class="flex items-center mt-2">
                                    <input type="checkbox" id="add-is-area" name="isArea" class="h-4 w-4 text-indigo-600 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700">標示為整個社區/區域</span>
                                </label>
                                <p class="text-xs text-gray-500 mt-1">勾選後，可點擊地圖上的網格來標示範圍。</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">黑名類別</label>
                                <select id="add-blacklist-category" name="blacklistCategory" class="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm">
                                    <option value="" disabled selected>請選擇...</option>
                                    <option value="黑客">黑客</option>
                                    <option value="送上樓">送上樓</option>
                                    <option value="需爬梯">需爬梯</option>
                                    <option value="拖吊">拖吊</option>
                                    <option value="騙餐">騙餐</option>
                                    <option value="奇怪">奇怪</option>
                                    <option value="性騷擾">性騷擾</option>
                                    <option value="店家">店家</option>
                                    <option value="其他">其他</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">黑名原因</label>
                                <textarea id="add-blacklist-reason" name="blacklistReason" rows="3" class="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"></textarea>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Map Container -->
            <main id="map-container" class="w-full h-full relative">
                <div id="map"></div>
                <canvas id="grid-canvas"></canvas>

                <div id="grid-toolbar" class="hidden">
                    <button id="tool-pan" class="grid-tool-btn" title="移動畫面">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6"><path stroke-linecap="round" stroke-linejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 1 .198-.471 1.575 1.575 0 1 0-2.228-2.228 3.818 3.818 0 0 0-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0 1 16.35 15m.002 0h-.002" /></svg>
                    </button>
                    <div class="w-px h-6 bg-gray-300"></div>
                    <button id="tool-fill" class="grid-tool-btn active" title="填色">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" /></svg>
                    </button>
                    <button id="tool-eraser" class="grid-tool-btn" title="擦除">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" /></svg>
                    </button>
                    <div id="marker-tools">
                        <button id="tool-entrance" class="grid-tool-btn font-bold text-lg" title="入口">入</button>
                        <button id="tool-exit" class="grid-tool-btn font-bold text-lg" title="出口">出</button>
                        <button id="tool-table" class="grid-tool-btn font-bold text-lg" title="外送桌">桌</button>
                        <button id="tool-parking" class="grid-tool-btn font-bold text-lg" title="停車位置">停</button>
                    </div>
                </div>

                <div id="grid-color-palette" class="hidden absolute top-4 right-24 z-20 bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-lg flex flex-col space-y-2 w-28">
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">格子顏色</label>
                        <input type="color" id="palette-fill-color" value="#ef4444">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">標記顏色</label>
                        <input type="color" id="palette-marker-color" value="#000000">
                    </div>
                </div>
                
                <div id="notification" class="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-yellow-500 text-white text-sm py-2 px-4 rounded-lg shadow-lg hidden transition-all duration-300"></div>

                <div id="popup" class="ol-popup">
                    <a href="#" id="popup-closer" class="ol-popup-closer"></a>
                    <div id="popup-content"></div>
                </div>
                
                <div id="user-location" class="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 hidden">
                    <div class="w-full h-full rounded-full bg-blue-600 border-2 border-white shadow-md pulse-dot"></div>
                </div>
                
                <div id="desktop-center-marker" class="hidden">
                     <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ef4444' width='40px' height='40px'><path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'/></svg>" alt="Center Marker">
                </div>
                
                <div id="search-panel" class="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg w-[90%] max-w-md hidden">
                    <div class="relative">
                        <input type="text" id="search-address-input" placeholder="輸入地址或關鍵字搜尋..." class="w-full p-2 pl-10 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" /></svg>
                        </div>
                        <button id="close-search-panel" class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                            <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>
                </div>

                <div id="main-action-buttons" class="absolute top-4 right-4 z-10 flex flex-col items-end space-y-2">
                    <div id="login-status">
                        <div id="google-signin-container" style="display: none;"></div>
                         <div id="add-info" class="bg-white text-gray-700 py-2 px-4 rounded-lg shadow-lg items-center space-x-2 hidden">
                            <img id="user-picture" src="" alt="使用者頭像" class="w-6 h-6 rounded-full mr-2 hidden">
                            <span id="user-name" class="font-bold"></span>
                            <button id="edit-nickname-btn" class="text-xs text-blue-500 hover:underline">[修改]</button>
                            <button id="manage-btn" class="text-sm text-blue-600 hover:underline">管理</button>
                            <button id="review-btn" class="text-sm text-red-600 hover:underline hidden">審核</button>
                            <a href="#" id="sign-out-btn" class="text-xs text-gray-500 hover:underline ml-2">登出</a>
                        </div>
                    </div>
                    <button id="search-address-btn" class="bg-white text-gray-700 p-3 rounded-lg shadow-lg hover:bg-gray-100 transition-colors duration-300 flex items-center justify-center" title="搜尋地址">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" /></svg>
                    </button>
                    <button id="open-filter-modal" class="bg-blue-600 text-white p-3 rounded-lg shadow-lg hover:bg-blue-700 transition-colors duration-300 flex items-center justify-center" title="篩選">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd" /></svg>
                    </button>
                     <button id="center-on-me-btn" class="bg-white text-gray-700 p-3 rounded-lg shadow-lg hover:bg-gray-100 transition-colors duration-300 flex items-center justify-center" title="回到我的位置">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                    </button>
                    <button id="open-chat-btn" class="relative bg-white text-gray-700 p-3 rounded-lg shadow-lg hover:bg-gray-100 transition-colors duration-300 flex items-center justify-center" title="聊天室">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>
                        <span id="chat-unread-badge" class="hidden absolute -top-1 -right-1 bg-green-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center"></span>
                    </button>
                    <button id="add-location-btn" class="bg-white text-gray-700 p-3 rounded-lg shadow-lg hover:bg-gray-100 transition-colors duration-300 flex items-center justify-center" title="新增地點">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                    </button>
                </div>

                <div id="legend" class="absolute left-1/2 -translate-x-1/2 z-10 bg-white/80 backdrop-blur-sm p-3 rounded-lg shadow-md">
                    <div id="legend-content" class="flex items-center justify-center flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm"></div>
                </div>
                
                <div id="store-list-panel" class="absolute left-4 w-64 z-10 bg-white/80 backdrop-blur-sm p-3 rounded-lg shadow-md flex flex-col transition-all duration-300 ease-in-out" style="max-height: 14rem;">
                    <div class="flex justify-between items-start flex-shrink-0 mb-2">
                        <div id="store-list-filters" class="flex-grow flex overflow-x-auto pb-1 custom-scrollbar"></div>
                    </div>
                    <div id="store-list-content" class="flex-grow overflow-y-auto custom-scrollbar pr-2 transition-all duration-300"></div>
                </div>
                
                <button id="complete-placement-btn" class="hidden absolute top-20 right-20 z-20 bg-red-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-red-700 transition-colors">完成位置設定</button>
                
                <button id="restore-modal-btn" class="hidden absolute top-1/2 -translate-y-1/2 -left-1 z-20 bg-white p-2 rounded-r-full shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>

                <button id="restore-mobile-modal-btn" class="hidden absolute top-1/2 -translate-y-1/2 -left-1 z-30 bg-white p-2 rounded-r-full shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
            </main>
        </div>

        <!-- Modals -->
        <div id="add-location-modal-mobile" class="hidden fixed inset-0 z-[60] flex items-start justify-center p-4 pt-12 sm:items-center sm:pt-4 overflow-hidden">
             <div class="bg-white shadow-2xl w-full max-w-md rounded-lg flex flex-col transition-transform duration-300 ease-in-out" style="max-height: calc(100vh - 5rem);">
                <form id="add-location-form-mobile" class="flex-grow flex flex-col overflow-hidden">
                    <div class="p-4 border-b flex justify-between items-center flex-shrink-0">
                        <button type="button" id="minimize-mobile-modal-btn" class="hidden text-gray-400 hover:text-gray-600 p-2 -ml-2 mr-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div id="mobile-modal-title-container" class="flex-grow">
                             <div class="flex border-b border-gray-200">
                                <button type="button" id="mobile-add-point-tab" class="mobile-add-tab active py-2 px-4 text-sm font-medium text-center text-indigo-600 bg-indigo-50 rounded-t-lg">新增地點</button>
                                <button type="button" id="mobile-add-area-tab" class="mobile-add-tab py-2 px-4 text-sm font-medium text-center text-gray-500 hover:text-gray-700">新增建築</button>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2 pl-2">
                             <button id="submit-location-btn-mobile" type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center w-28">
                                <span class="submit-text">送出審核</span>
                                <span class="spinner hidden animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                            </button>
                            <button id="close-add-location-modal-mobile" type="button" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
                        </div>
                    </div>
                    <div class="px-6 pt-2 pb-16 space-y-4 overflow-y-auto custom-scrollbar flex-grow">
                       <div id="mobile-point-fields"></div>
                       <div id="mobile-area-fields" class="hidden"></div>
                    </div>
                </form>
            </div>
        </div>

        <div id="filter-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div class="p-6 border-b flex justify-between items-center">
                    <h2 class="text-xl font-bold text-gray-800">篩選</h2>
                    <button id="close-filter-modal" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
                </div>
                <div class="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div class="mb-4">
                        <label for="category-select" class="block text-sm font-medium text-gray-700 mb-1">分類</label>
                        <select id="category-select" class="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"><option value="">所有分類</option></select>
                    </div>
                    <div class="mb-4">
                        <label for="keyword-search" class="block text-sm font-medium text-gray-700 mb-1">關鍵字搜尋</label>
                        <input type="text" id="keyword-search" placeholder="地址、關鍵字" class="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                    </div>
                </div>
                <div class="p-6 bg-gray-50 border-t rounded-b-lg flex space-x-2">
                    <button id="filter-btn" class="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700">套用篩選</button>
                    <button id="reset-btn" class="w-full bg-gray-500 text-white py-2 px-4 rounded-md hover:bg-gray-600">重設</button>
                </div>
            </div>
        </div>
        
        <div id="product-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-lg">
                <div class="p-6 border-b flex justify-between items-center">
                    <h2 id="product-modal-title" class="text-xl font-bold text-gray-800">黑名原因</h2>
                    <button id="close-product-modal" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
                </div>
                <div id="product-modal-content" class="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar whitespace-pre-wrap"></div>
            </div>
        </div>

        <div id="management-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col" style="height: 80vh;">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-xl font-bold text-gray-800">我的貢獻管理</h2>
                    <button id="close-management-modal" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
                </div>
                <div class="border-b border-gray-200">
                    <nav class="-mb-px flex space-x-6 px-6" aria-label="Tabs">
                        <button id="manage-locations-tab" class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-indigo-500 text-indigo-600">我的地點</button>
                        <button id="manage-areas-tab" class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">我的建築</button>
                    </nav>
                </div>
                <div class="flex-grow overflow-y-auto custom-scrollbar">
                    <div id="management-list-content" class="p-6"></div>
                    <div id="management-area-content" class="p-6 hidden"></div>
                </div>
            </div>
        </div>

        <div id="review-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl flex flex-col" style="height: 90vh;">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-xl font-bold text-gray-800">審核地點</h2>
                    <div class="flex items-center space-x-2">
                        <button id="review-refresh-btn" class="p-2 rounded-full hover:bg-gray-100 transition-colors" title="重新整理">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4 4l16 16" transform="rotate(90 12 12)"></path></svg>
                        </button>
                        <button id="close-review-modal" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
                    </div>
                </div>
                <div class="border-b border-gray-200">
                    <nav class="-mb-px flex space-x-6 px-6" aria-label="Tabs">
                        <button id="pending-tab" class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-indigo-500 text-indigo-600">待審核</button>
                        <button id="approved-tab" class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">已審核/已駁回</button>
                    </nav>
                </div>
                <div class="flex-grow overflow-y-hidden flex">
                    <div id="review-list-panel" class="w-1/3 border-r overflow-y-auto custom-scrollbar bg-gray-50"></div>
                    <div id="review-detail-panel" class="w-2/3 p-6 overflow-y-auto custom-scrollbar">
                        <p class="text-gray-500">請從左側列表選擇一個地點以查看詳細資訊。</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="chat-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col" style="height: 70vh;">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-xl font-bold text-gray-800">外送員聊天室</h2>
                    <div class="flex items-center space-x-4">
                         <label class="flex items-center text-sm text-gray-600 cursor-pointer">
                            <input type="checkbox" id="hide-system-msgs-checkbox" class="h-4 w-4 rounded border-gray-300 text-indigo-600">
                            <span class="ml-2 whitespace-nowrap">隱藏系統訊息</span>
                         </label>
                        <button id="close-chat-modal" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
                    </div>
                </div>
                <div id="chat-messages" class="flex-grow p-4 overflow-y-auto custom-scrollbar flex flex-col space-y-2 bg-gray-50"></div>
                <div class="p-4 bg-white border-t">
                    <div class="flex items-center space-x-2">
                        <input type="text" id="chat-input" placeholder="輸入訊息..." class="w-full p-2 border border-gray-300 rounded-md shadow-sm">
                        <button id="send-chat-btn" class="bg-indigo-600 text-white p-2 rounded-md hover:bg-indigo-700 flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div id="facebook-blocker-modal" class="fixed inset-0 bg-black/80 z-[200] flex-col items-center justify-center p-8 text-white text-center hidden">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <h2 class="text-2xl font-bold mb-4">功能可能受限</h2>
            <p class="text-lg">您似乎正在使用 Facebook 內建瀏覽器。<br><br>為了獲得最佳體驗，建議您點擊畫面右上角的「<span class="font-bold">•••</span>」選單，然後選擇「<span class="font-bold">在瀏覽器中開啟</span>」。</p>
        </div>

        <div id="chat-context-menu" class="hidden absolute z-[100] bg-white rounded-md shadow-lg py-1 w-32">
            <a href="#" id="context-private-msg" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">私訊</a>
            <a href="#" id="context-mute-user" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50 admin-only">禁言</a>
        </div>

        <div id="mute-user-modal" class="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 hidden">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-sm">
                <form id="mute-user-form">
                    <div class="p-6 border-b">
                        <h2 class="text-xl font-bold text-gray-800">禁言使用者</h2>
                        <p class="text-sm text-gray-500 mt-1">您正準備禁言 <span id="mute-user-name" class="font-semibold"></span></p>
                    </div>
                    <div class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">天數</label>
                            <input type="number" id="mute-days" min="0" value="0" class="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">分鐘</label>
                            <input type="number" id="mute-minutes" min="0" value="10" class="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm">
                        </div>
                    </div>
                    <div class="p-4 bg-gray-50 border-t rounded-b-lg flex justify-end space-x-2">
                        <button type="button" id="cancel-mute-btn" class="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300">取消</button>
                        <button type="submit" class="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700">確認禁言</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Main Application Script -->
    <script type="module" src="js/main.js"></script>

    <!-- Google Sign-In Callback (Global Scope) -->
    <script>
        function handleCredentialResponse(response) {
            const base64Url = response.credential.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => 
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            ).join(''));
            
            window.dispatchEvent(new CustomEvent('google-signin-success', { 
                detail: JSON.parse(jsonPayload) 
            }));
        }
    </script>
</body>
</html>

