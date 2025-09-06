/**
 * @file 管理 WebSocket 聊天室連線、訊息收發和 UI。
 */
import { WEBSOCKET_URL, CHAT_APPS_SCRIPT_URL } from './config.js';
import { showNotification } from './ui.js';
import { getLoginStatus, getUserProfile, getCurrentUserDisplayName, getIsAdmin } from './auth.js';
import { getArchivedChatHistory, muteUserAPI } from './api.js';

let ws = null;
let heartbeatInterval = null;
let unreadChatCount = 0;
let isChatHistoryLoaded = false;
let contextMenuTarget = {}; // 用於右鍵選單操作
let currentUserCity = '未知區域'; // 由 main.js 設置

/**
 * 設定目前使用者所在的城市。
 * @param {string} city - 城市名稱。
 */
export function setCurrentUserCity(city) {
    currentUserCity = city || '未知區域';
}

/**
 * 初始化 WebSocket 連線。
 */
export function initializeChat() {
    function connect() {
        if (ws && ws.readyState === WebSocket.OPEN) return;

        ws = new WebSocket(WEBSOCKET_URL);

        ws.onopen = function() {
            console.log('聊天室已連線。');
            sendJoinMessage();
            
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);
        };

        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'history':
                        // 我們從 Apps Script 載入歷史，所以忽略這個
                        break;
                    case 'chat':
                        if ($('#chat-modal').is(':hidden')) {
                            unreadChatCount++;
                            $('#chat-unread-badge').text(unreadChatCount).removeClass('hidden');
                        }
                        appendChatMessage(data);
                        break;
                    case 'system_join':
                    case 'system_leave':
                    case 'system_name_change':
                        appendChatMessage(data);
                        break;
                    case 'pong':
                        // Heartbeat response
                        break;
                    default:
                        console.warn("收到未知的訊息類型:", data.type);
                }
            } catch (e) {
                console.error("無法解析收到的訊息:", event.data, e);
            }
        };

        ws.onclose = function() {
            console.log('聊天室連線已中斷，3秒後嘗試重新連線...');
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            setTimeout(connect, 3000);
        };

        ws.onerror = function(error) {
            console.error('WebSocket 錯誤:', error);
            ws.close();
        };
    }
    connect();
}

/**
 * 發送使用者加入聊天室的訊息。
 */
export function sendJoinMessage() {
    if (getLoginStatus() && ws && ws.readyState === WebSocket.OPEN) {
        const profile = getUserProfile();
        const payload = {
            type: 'join',
            userId: profile.email || profile.lineUserId, 
            nickname: getCurrentUserDisplayName(),
            pictureUrl: profile.pictureUrl || '',
            city: currentUserCity
        };
        ws.send(JSON.stringify(payload));
    }
}

/**
 * 當使用者變更暱稱時，發送通知。
 * @param {string} newName - 新的暱稱。
 */
export function sendNicknameChange(newName) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const payload = { 
            type: 'nickname_change',
            newName: newName
        };
        ws.send(JSON.stringify(payload));
    }
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

    if (message && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'chat', message: message }));
        $input.val('');
    }
}

/**
 * 將一條訊息附加到聊天視窗。
 * @param {Object} data - 訊息資料。
 */
function appendChatMessage(data) {
    const $chatMessages = $('#chat-messages');
    if ($chatMessages.find(`[data-timestamp="${data.timestamp}"]`).length > 0) return;

    const messageTime = new Date(data.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' });
    const sanitizedMessage = $('<div>').text(data.message || '').html();
    const sanitizedNickname = $('<div>').text(data.nickname || '匿名').html();
    const sanitizedCity = $('<div>').text(data.city || '未知區域').html();
    const sanitizedPictureUrl = data.pictureUrl ? $('<div>').text(data.pictureUrl).html() : 'https://placehold.co/40x40/E2E8F0/A0AEC0?text=?';

    let messageHtml = '';
    switch (data.type) {
        case 'chat':
            messageHtml = `
                <div class="chat-message-item flex items-start space-x-3 p-1 rounded-md hover:bg-gray-100" 
                     data-timestamp="${data.timestamp}" data-user-id="${data.userId || ''}" data-user-name="${sanitizedNickname}">
                    <img src="${sanitizedPictureUrl}" alt="avatar" class="w-8 h-8 rounded-full flex-shrink-0">
                    <div>
                        <div class="flex items-baseline space-x-2">
                            <span class="font-bold text-blue-600">${sanitizedNickname}</span>
                            <span class="text-xs text-gray-500">(${sanitizedCity})</span>
                            <span class="text-xs text-gray-400">${messageTime}</span>
                        </div>
                        <p class="text-gray-800 break-words">${sanitizedMessage}</p>
                    </div>
                </div>`;
            break;
        case 'system_join':
        case 'system_leave':
        case 'system_name_change':
            messageHtml = `<div class="text-center text-xs text-gray-500 italic py-1 system-message" data-timestamp="${data.timestamp}">${sanitizedMessage}</div>`;
            break;
    }
    
    if (messageHtml) {
        $chatMessages.append(messageHtml);
        // 自動滾動到底部
        $chatMessages.scrollTop($chatMessages[0].scrollHeight);
    }
}

/**
 * 從後端載入歷史聊天紀錄。
 */
async function loadArchivedChatHistory() {
    if (!getLoginStatus() || isChatHistoryLoaded) return;

    try {
        const history = await getArchivedChatHistory();
        if (Array.isArray(history) && history.length > 0) {
            const $chatMessages = $('#chat-messages').empty();
            history.forEach(log => {
                appendChatMessage({
                    type: 'chat',
                    message: log.message, 
                    nickname: log.conversation_name,
                    city: log.conversation_location,
                    pictureUrl: log.pictureUrl || '',
                    timestamp: log.updated_time,
                    userId: log.conversation_id
                });
            });
            $chatMessages.scrollTop($chatMessages[0].scrollHeight);
            isChatHistoryLoaded = true;
        }
    } catch (error) {
        console.error("無法載入歷史聊天紀錄:", error);
        showNotification('載入歷史聊天紀錄失敗', 'error');
    }
}

/**
 * 處理聊天訊息的右鍵/長按選單。
 * @param {HTMLElement} element - 目標訊息元素。
 * @param {number} x - 頁面 X 座標。
 * @param {number} y - 頁面 Y 座標。
 */
function handleContextMenu(element, x, y) {
    const $el = $(element);
    const userId = $el.data('user-id');
    const userName = $el.data('user-name');
    const currentUser = getUserProfile();

    if (!userId || userId === (currentUser.email || currentUser.lineUserId)) {
        return; // 不能對自己操作
    }
    
    contextMenuTarget = { userId, userName };
    
    $('#context-mute-user').toggle(getIsAdmin()); // 只有管理員能看到禁言選項
    
    $('#chat-context-menu').css({ top: `${y}px`, left: `${x}px` }).removeClass('hidden');
}

/**
 * 設置聊天室相關的事件監聽器。
 */
export function setupChatListeners() {
    let longPressTimer;

    $('#open-chat-btn').on('click', async () => {
        $('#chat-modal').removeClass('hidden');
        unreadChatCount = 0;
        $('#chat-unread-badge').addClass('hidden').text('');
        await loadArchivedChatHistory(); // 確保打開時有歷史紀錄
        const $chatWindow = $('#chat-messages');
        setTimeout(() => $chatWindow.scrollTop($chatWindow[0].scrollHeight), 0);
    });

    $('#close-chat-modal').on('click', () => $('#chat-modal').addClass('hidden'));
    $('#send-chat-btn').on('click', sendChatMessage);
    $('#chat-input').on('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    $('#hide-system-msgs-checkbox').on('change', function() {
        $('#chat-messages').toggleClass('hide-system-messages', $(this).is(':checked'));
    });

    // --- 右鍵與長按事件 ---
    $('#chat-messages')
        .on('contextmenu', '.chat-message-item', function(e) {
            e.preventDefault();
            handleContextMenu(this, e.pageX, e.pageY);
        })
        .on('touchstart', '.chat-message-item', function(e) {
            const target = this;
            longPressTimer = setTimeout(() => handleContextMenu(target, e.touches[0].pageX, e.touches[0].pageY), 500);
        })
        .on('touchend touchmove', '.chat-message-item', () => clearTimeout(longPressTimer));

    // 點擊頁面其他地方關閉選單
    $(document).on('click', () => $('#chat-context-menu').addClass('hidden'));
    
    // --- 禁言 Modal ---
    $('#context-mute-user').on('click', function(e) {
        e.preventDefault();
        $('#chat-context-menu').addClass('hidden');
        if (contextMenuTarget.userId) {
            $('#mute-user-name').text(contextMenuTarget.userName);
            $('#mute-user-modal').removeClass('hidden');
        }
    });

    $('#cancel-mute-btn').on('click', () => $('#mute-user-modal').addClass('hidden'));
    
    $('#mute-user-form').on('submit', async function(e) {
        e.preventDefault();
        const days = parseInt($('#mute-days').val(), 10) || 0;
        const minutes = parseInt($('#mute-minutes').val(), 10) || 0;
        if (days === 0 && minutes === 0) {
            showNotification('請設定有效的禁言時間。', 'warning');
            return;
        }

        const duration = `${days}d${minutes}m`;
        showNotification(`正在禁言 ${contextMenuTarget.userName}...`, 'info');

        try {
            const result = await muteUserAPI(contextMenuTarget.userId, contextMenuTarget.userName, duration);
            if (result.status === 'success') {
                showNotification(`${contextMenuTarget.userName} 已被禁言。`, 'success');
                $('#mute-user-modal').addClass('hidden');
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch(error) {
            showNotification(`禁言失敗: ${error.message}`, 'error');
        }
    });
}

