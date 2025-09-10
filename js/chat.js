/**
 * @file 管理聊天室的 WebSocket 連線與訊息處理。
 */
import { WEBSOCKET_URL } from './config.js';
import { getLoginStatus, getIsAdmin, getUserProfile, triggerLogin } from './auth.js';
import { showNotification } from './ui.js';
import * as api from './api.js';

// --- 模組內部狀態 ---
let ws = null;
let heartbeatInterval = null;
let unreadChatCount = 0;
let currentUserCity = '未知區域';
let contextMenuTarget = { userId: null, userName: null };
let systemMessageQueue = [];
let historyPromise = null;
let isHistoryRendered = false; // 新增：標記歷史紀錄是否已渲染

export const setCurrentUserCity = (city) => currentUserCity = city || '未知區域';

/**
 * 初始化 WebSocket 連線。
 */
export function initializeChat() {
    function connect() {
        if (ws && ws.readyState === WebSocket.OPEN) return;

        ws = new WebSocket(WEBSOCKET_URL);

        ws.onopen = () => {
            console.log('聊天室已連線。');
            sendJoinMessage();
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 30000);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'history':
                        break;
                    case 'chat':
                        const profile = getUserProfile();
                        const currentUserId = profile.email || profile.lineUserId;
                        if (data.userId === currentUserId) {
                            return; 
                        }
                        
                        if ($('#chat-modal').hasClass('hidden')) {
                            unreadChatCount++;
                            $('#chat-unread-badge').text(unreadChatCount).removeClass('hidden');
                        }
                        appendChatMessage(data);
                        break;
                    case 'system_join':
                    case 'system_leave':
                    case 'system_name_change':
                        // 確保任何時候收到的系統訊息都能被加入
                        appendChatMessage(data);
                        break;
                    case 'pong':
                        break;
                    default:
                        console.warn("收到未知的訊息類型:", data.type);
                }
            } catch (e) {
                console.error("無法解析收到的訊息:", event.data, e);
            }
        };

        ws.onclose = () => {
            console.log('聊天室連線已中斷，3秒後嘗試重新連線...');
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            setTimeout(connect, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket 錯誤:', error);
            ws.close();
        };
    }
    connect();
}

/**
 * 發送使用者加入或名稱變更的訊息到 WebSocket。
 */
export function sendJoinMessage() {
    if (getLoginStatus() && ws?.readyState === WebSocket.OPEN) {
        const profile = getUserProfile();
        ws.send(JSON.stringify({
            type: 'join',
            userId: profile.email || profile.lineUserId,
            nickname: profile.name || '匿名',
            pictureUrl: profile.pictureUrl || '',
            city: currentUserCity
        }));
    }
}

/**
 * 將一則系統/載入訊息附加到聊天視窗。
 * @param {string} message - 要顯示的訊息。
 */
function appendLoadingMessage(message) {
    const $chatMessages = $('#chat-messages');
    const messageHtml = `<div class="text-center text-xs text-gray-500 italic py-1 loading-message">${message}</div>`;
    $chatMessages.append(messageHtml);
    $chatMessages.scrollTop($chatMessages[0].scrollHeight);
}

/**
 * 預先載入聊天歷史紀錄。
 */
export function preloadHistory() {
    if (!historyPromise && getLoginStatus()) {
        historyPromise = api.getArchivedChatHistory();
        historyPromise.catch(err => {
            console.error("聊天歷史紀錄預載失敗:", err);
            historyPromise = null;
        });
    }
}


/**
 * 載入存檔的歷史聊天紀錄並顯示在畫面上。
 */
async function loadArchivedChatHistory() {
    // 如果已渲染過，或未登入，則直接返回
    if (isHistoryRendered || !getLoginStatus()) return;

    const $chatMessages = $('#chat-messages');
    const $chatInput = $('#chat-input');
    const $sendBtn = $('#send-chat-btn');

    $chatInput.prop('disabled', true).attr('placeholder', '載入中...');
    $sendBtn.prop('disabled', true);
    systemMessageQueue = [];
    
    appendLoadingMessage('讀取使用者訊息...');
    await new Promise(resolve => setTimeout(resolve, 200));
    appendLoadingMessage(`正在偵測你的位置... (${currentUserCity})`);
    await new Promise(resolve => setTimeout(resolve, 300));
    appendLoadingMessage('讀取歷史訊息...');

    try {
        if (!historyPromise) {
            preloadHistory();
        }
        
        const history = await historyPromise;
        
        $chatMessages.find('.loading-message').remove();

        if (Array.isArray(history) && history.length > 0) {
            for (const log of history) {
                appendChatMessage({
                    type: 'chat',
                    message: log.message,
                    nickname: log.conversation_name,
                    city: log.conversation_location,
                    pictureUrl: log.pictureUrl || '',
                    timestamp: log.updated_time,
                    userId: log.conversation_id,
                });
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        }
        
        processSystemMessageQueue();
        isHistoryRendered = true; // 設定旗標，表示歷史紀錄已成功載入
        $chatMessages.scrollTop($chatMessages[0].scrollHeight);

    } catch (error) {
        console.error("無法載入歷史聊天紀錄:", error);
        historyPromise = null;
        $chatMessages.find('.loading-message').remove();
        appendLoadingMessage('載入歷史紀錄失敗，請稍後再試。');
    } finally {
        $chatInput.prop('disabled', false).attr('placeholder', '輸入訊息...');
        $sendBtn.prop('disabled', false);
    }
}

/**
 * 處理並顯示佇列中的系統訊息。
 */
function processSystemMessageQueue() {
    systemMessageQueue.forEach(appendChatMessage);
    systemMessageQueue = [];
}


/**
 * 將一則訊息附加到聊天視窗。
 * @param {Object} data - 訊息資料。
 */
function appendChatMessage(data) {
    const $chatMessages = $('#chat-messages');
    if (data.timestamp && $chatMessages.find(`[data-timestamp="${data.timestamp}"]`).length > 0) return;
    
    const time = new Date(data.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const sanitizedMsg = $('<div>').text(data.message || '').html();
    
    let messageHtml = '';
    if (data.type.startsWith('system')) {
        messageHtml = `<div class="text-center text-xs text-gray-500 italic py-1 system-message" data-timestamp="${data.timestamp}">${sanitizedMsg}</div>`;
    } else {
        const sanitizedNick = $('<div>').text(data.nickname || '匿名').html();
        const sanitizedCity = $('<div>').text(data.city || '未知').html();
        const pictureUrl = data.pictureUrl || 'https://placehold.co/40x40/E2E8F0/A0AEC0?text=?';
        messageHtml = `
            <div class="chat-message-item flex items-start space-x-3 p-1 rounded-md hover:bg-gray-100" 
                 data-timestamp="${data.timestamp}" data-user-id="${data.userId || ''}" data-user-name="${sanitizedNick}">
                <img src="${pictureUrl}" alt="avatar" class="w-8 h-8 rounded-full">
                <div>
                    <div class="flex items-baseline space-x-2">
                        <span class="font-bold text-blue-600">${sanitizedNick}</span>
                        <span class="text-xs text-gray-500">(${sanitizedCity})</span>
                        <span class="text-xs text-gray-400">${time}</span>
                    </div>
                    <p class="text-gray-800 break-words">${sanitizedMsg}</p>
                </div>
            </div>`;
    }
    
    const shouldScroll = $chatMessages.scrollTop() + $chatMessages.innerHeight() >= $chatMessages[0].scrollHeight - 30;
    $chatMessages.append(messageHtml);
    if (shouldScroll) $chatMessages.scrollTop($chatMessages[0].scrollHeight);
}

/**
 * 發送聊天訊息。
 */
function sendChatMessage() {
    if (!getLoginStatus()) {
        showNotification('請先登入才能發言！', 'warning');
        return;
    }
    const $input = $('#chat-input');
    const message = $input.val().trim();

    if (message && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'chat', message }));

        const profile = getUserProfile();
        const optimisticMessage = {
            type: 'chat',
            message: message,
            nickname: profile.name || '匿名',
            city: currentUserCity,
            pictureUrl: profile.pictureUrl || '',
            timestamp: new Date().toISOString(),
            userId: profile.email || profile.lineUserId,
        };
        appendChatMessage(optimisticMessage);
        
        $input.val('');
    }
}

// --- 右鍵選單與禁言 ---

function handleContextMenu(element, x, y) {
    const $el = $(element);
    const userId = $el.data('user-id');
    const userName = $el.data('user-name');
    const currentUser = getUserProfile();

    if (!userId || userId === (currentUser.email || currentUser.lineUserId)) return;
    
    contextMenuTarget = { userId, userName };
    
    $('#context-mute-user').toggle(getIsAdmin());
    
    $('#chat-context-menu').css({ top: `${y}px`, left: `${x}px` }).removeClass('hidden');
}

async function handleMuteUserSubmit(e) {
    e.preventDefault();
    const days = parseInt($('#mute-days').val()) || 0;
    const minutes = parseInt($('#mute-minutes').val()) || 0;
    
    if (days === 0 && minutes === 0) {
        showNotification('請設定有效的禁言時間。', 'warning');
        return;
    }
    
    const duration = `${days}d${minutes}m`;
    showNotification(`正在禁言 ${contextMenuTarget.userName}...`, 'info');
    
    try {
        const result = await api.muteUserAPI(contextMenuTarget.userId, contextMenuTarget.userName, duration);
        if (result.status !== 'success') throw new Error(result.message);
        showNotification(`${contextMenuTarget.userName} 已被禁言。`, 'success');
        $('#mute-user-modal').addClass('hidden');
    } catch(error) {
        showNotification(`禁言失敗: ${error.message}`, 'error');
    }
}


/**
 * 初始化所有與聊天室相關的事件監聽器。
 */
export function setupChatListeners() {
    let longPressTimer;

    $('#open-chat-btn').on('click', async () => {
        if (!getLoginStatus()) {
            await triggerLogin();
            return;
        }
        
        // 只有在歷史紀錄尚未渲染時，才執行清空和載入
        if (!isHistoryRendered) {
            $('#chat-messages').empty();
            await loadArchivedChatHistory();
        }

        $('#chat-modal').removeClass('hidden');
        unreadChatCount = 0;
        $('#chat-unread-badge').addClass('hidden').text('');
        setTimeout(() => $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight), 0);
    });
    $('#close-chat-modal').on('click', () => $('#chat-modal').addClass('hidden'));
    $('#send-chat-btn').on('click', sendChatMessage);
    $('#chat-input').on('keydown', e => e.key === 'Enter' && (e.preventDefault(), sendChatMessage()));
    $('#hide-system-msgs-checkbox').on('change', (e) => $('#chat-messages').toggleClass('hide-system-messages', e.target.checked));

    // 右鍵選單
    $('#chat-messages').on('contextmenu touchstart', '.chat-message-item', function(e) {
        e.preventDefault();
        const targetElement = this;
        if (e.type === 'touchstart') {
            longPressTimer = setTimeout(() => handleContextMenu(targetElement, e.touches[0].pageX, e.touches[0].pageY), 500);
        } else {
            handleContextMenu(targetElement, e.pageX, e.pageY);
        }
    }).on('touchend touchmove', '.chat-message-item', () => clearTimeout(longPressTimer));

    $(document).on('click', () => $('#chat-context-menu').addClass('hidden'));
    
    // 禁言 Modal
    $('#mute-user-form').on('submit', handleMuteUserSubmit);
    $('#cancel-mute-btn').on('click', () => $('#mute-user-modal').addClass('hidden'));
    $('#context-mute-user').on('click', e => {
        e.preventDefault();
        $('#chat-context-menu').addClass('hidden');
        if (contextMenuTarget.userId) {
            $('#mute-user-name').text(contextMenuTarget.userName);
            $('#mute-user-modal').removeClass('hidden');
        }
    });
}
