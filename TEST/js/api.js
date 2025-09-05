import { state } from './state.js';
import { APPS_SCRIPT_URL, GOOGLE_API_KEY } from './config.js';
import { showNotification, populateFiltersAndLegend, updateStoreList } from './ui.js';
import { drawCommunityAreas, createPointFeature } from './map.js';

/**
 * 從 Google Sheet 載入地圖資料
 * @param {string|null} city - 要載入的城市，或 null 代表全部
 */
export async function loadData(city = null) {
    showNotification('正在讀取資料...');
    let url = `${APPS_SCRIPT_URL}?action=getData&t=${new Date().getTime()}`;
    if (city) {
        url += `&city=${encodeURIComponent(city)}`;
    }
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        
        const results = await response.json();
        state.rawReports = results;
        
        const groupedData = new Map();
        const communityAreas = [];

        results.forEach(data => {
            if (data.isCommunity) {
                communityAreas.push(data);
            }
            const baseAddress = (data['地址'] || '').split(/樓|之|-/)[0].trim();
            if (baseAddress) {
                if (!groupedData.has(baseAddress)) {
                    groupedData.set(baseAddress, []);
                }
                groupedData.get(baseAddress).push(data);
            }
        });

        state.vectorSource.clear();
        state.areaGridSource.clear();
        state.allFeatures = [];
        const pinyinOptions = { pattern: 'pinyin', toneType: 'none', removeNonZh: true };
        
        drawCommunityAreas(communityAreas);

        groupedData.forEach((group, baseAddress) => {
            if (group.every(item => item.isCommunity)) return;
            createPointFeature(group, baseAddress, pinyinPro.pinyin, pinyinOptions);
        });
        
        const fuseOptions = {
            includeScore: true,
            threshold: 0.1,
            minMatchCharLength: 2,
            ignoreLocation: true,
            keys: ['values_.address_pinyin', 'values_.reports.blacklistReason']
        };
        state.fuse = new Fuse(state.allFeatures, fuseOptions);

        populateFiltersAndLegend();
        updateStoreList();
        $('#notification').addClass('hidden');
    } catch (error) {
        console.error("Load data error:", error);
        showNotification('無法載入資料！請稍後再試。', 'error');
    }
}

/**
 * 根據地址取得座標
 * @param {string} address - 要查詢的地址
 * @returns {Promise<Object|null>}
 */
export async function geocodeAddress(address) {
    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}&region=TW&language=zh-TW`);
        if (!response.ok) throw new Error('Geocoding API response not OK');
        return await response.json();
    } catch (error) {
        console.error('Geocoding failed:', error);
        showNotification('地址解析失敗', 'error');
        return null;
    }
}

/**
 * 根據座標取得地址
 * @param {number} lon - 經度
 * @param {number} lat - 緯度
 * @param {jQuery} [$form] - 要填入地址的表單
 */
export async function reverseGeocode(lon, lat, $form = $('#add-location-form')) {
    const $addressInput = $form.find('#add-address');
    const $areaNameInput = $form.find('#add-area-name');
    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_API_KEY}&language=zh-TW`);
        if (!response.ok) throw new Error('Geocoding API response not OK');
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const results = data.results;
            $addressInput.val(results[0].formatted_address);
            state.latestGeocodeBounds = results[0].geometry.viewport;

            const poi = results.find(r => r.types.includes('establishment') || r.types.includes('point_of_interest') || r.types.includes('premise'));
            let foundName = '';
            if (poi) {
                 const nameComponent = poi.address_components.find(c => c.types.includes('point_of_interest') || c.types.includes('premise'));
                 if(nameComponent) foundName = nameComponent.long_name;
            }
            if (!foundName) {
                const sublocality = results[0].address_components.find(c => c.types.includes('administrative_area_level_4') || c.types.includes('sublocality_level_1'));
                if (sublocality) foundName = sublocality.long_name;
            }
            $areaNameInput.val(foundName || '');
        } else {
            $addressInput.val('無法自動定位地址');
            $areaNameInput.val('');
            state.latestGeocodeBounds = null;
        }
    } catch (error) {
        $addressInput.val('無法自動定位地址');
        $areaNameInput.val('');
        state.latestGeocodeBounds = null;
        showNotification('無法解析地址，請手動輸入。', 'warning');
    }
}

/**
 * 定位使用者
 */
export function initializeUserLocation() {
    if (!navigator.geolocation) {
        showNotification('您的瀏覽器不支援地理定位', 'warning');
        loadData(); 
        state.isLocationKnown = true;
        if (state.isLoggedIn) sendJoinMessage();
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            state.userPositionCoords = ol.proj.fromLonLat([pos.coords.longitude, pos.coords.latitude]);
            state.map.getView().animate({ center: state.userPositionCoords, zoom: 16, duration: 1500 });
            state.userLocationOverlay.setPosition(state.userPositionCoords);
            $('#user-location').removeClass('hidden');

            const city = await reverseGeocodeForCity(pos.coords.longitude, pos.coords.latitude);
            state.currentUserCity = city || '未知區域';
            state.isLocationKnown = true;
            loadData(city);
            if (state.isLoggedIn) {
                // This is a bit of a circular dependency, but auth should handle sending the message
                const event = new CustomEvent('location-known');
                window.dispatchEvent(event);
            }
        },
        () => {
            showNotification('無法取得您的位置，聊天室將顯示「未知區域」。', 'warning');
            state.isLocationKnown = true;
            loadData();
            if (state.isLoggedIn) {
                 const event = new CustomEvent('location-known');
                window.dispatchEvent(event);
            }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

/**
 * 根據座標取得城市名稱
 * @param {number} lon 
 * @param {number} lat 
 * @returns {Promise<string|null>}
 */
async function reverseGeocodeForCity(lon, lat) {
    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_API_KEY}&language=zh-TW&result_type=administrative_area_level_1`);
        if (!response.ok) throw new Error('Geocoding API response not OK');
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const cityComponent = data.results[0].address_components.find(c => c.types.includes('administrative_area_level_1'));
            if (cityComponent) return cityComponent.long_name;
        }
        return null;
    } catch (error) {
        console.error("Reverse geocoding for city failed:", error);
        return null;
    }
}
