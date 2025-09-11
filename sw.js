const CACHE_NAME = 'deliverymap-cache-v1';
// 需要被快取的核心檔案列表
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/js/map.js',
  '/js/ui.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/chat.js',
  '/js/config.js',
  '/js/add-location.js',
  '/js/grid.js',
  '/js/management.js',
  'https://cdn.jsdelivr.net/npm/ol@v9.2.4/ol.css',
  'https://cdn.tailwindcss.com',
  'https://code.jquery.com/jquery-3.7.1.js',
  'https://cdn.jsdelivr.net/npm/ol@v9.2.4/dist/ol.js',
  'https://accounts.google.com/gsi/client',
  'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0',
  'https://unpkg.com/pinyin-pro@3.18.2/dist/index.js'
];

// 1. 安裝 Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: 安裝中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: 開啟 Cache');
        // 使用 no-cors 模式來快取 CDN 資源，避免 CORS 問題
        const requests = urlsToCache.map(url => new Request(url, { mode: 'no-cors' }));
        return cache.addAll(requests);
      })
      .then(() => {
        console.log('Service Worker: 核心檔案快取完成');
        return self.skipWaiting();
      })
  );
});

// 2. 啟用 Service Worker，並清除舊快取
self.addEventListener('activate', event => {
  console.log('Service Worker: 啟用中...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: 刪除舊快取 -', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

// 3. 攔截網路請求，優先從快取提供資源
self.addEventListener('fetch', event => {
  // 對於 Google Apps Script 的請求，永遠直接從網路獲取，不使用快取
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果快取中有對應的回應，就直接回傳
        if (response) {
          return response;
        }

        // 如果快取中沒有，就發出網路請求
        return fetch(event.request).then(
          response => {
            // 對於非 GET 請求或非基本資源，不進行快取
            if (!response || response.status !== 200 || response.type !== 'basic' || event.request.method !== 'GET') {
              return response;
            }

            // 複製一份回應，因為 response 只能被使用一次
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

