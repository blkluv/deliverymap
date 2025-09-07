/**
 * @file 管理聊天室的 WebSocket 連線與訊息處理。
 */
import { showNotification } from './ui.js';
import { getIsAdmin, getLoginStatus, getUserProfile } from './auth.js';
import { WEBSOCKET_URL } from './config.js';
import * as api from './api.js';

// --- 模組內部狀態 ---
let ws = null;
let heartbeatInterval = null;
let currentUserCity = '未知區域';
let unreadChatCount = 0;
let contextMenuTarget = { userId: null, userName: null };

/**
 * 設定目前使用者的所在城市。
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

        ws.onopen = () => {
            console.log('聊天室已連線。');
            sendJoinMessage();
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
            }, 30000);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'chat':
                    case 'system_join': // 修正：將系統訊息也納入計數
                    case 'system_leave':
                    case 'system_name_change':
                        if ($('#chat-modal').is(':hidden')) {
                            unreadChatCount++;
                            $('#chat-unread-badge').text(unreadChatCount).removeClass('hidden');
                        }
                        appendChatMessage(data);
                        break;
                    case 'history':
                        // 忽略來自 websocket 的記憶體歷史訊息
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
 * 發送使用者加入聊天室的訊息。
 */
export function sendJoinMessage() {
    if (getLoginStatus() && ws?.readyState === WebSocket.OPEN) {
        const profile = getUserProfile();
        ws.send(JSON.stringify({
            type: 'join',
            userId: profile.email || profile.lineUserId,
            nickname: profile.name,
            pictureUrl: profile.pictureUrl || '',
            city: currentUserCity
        }));
    }
}

/**
 * 載入並顯示已封存的聊天歷史紀錄。
 */
export async function loadArchivedChatHistory() {
    console.log("正在從 Google Sheet 載入歷史訊息...");
    const history = await api.getArchivedChatHistory();
    if (Array.isArray(history) && history.length > 0) {
        const historyHtml = history.map(log => {
            return buildMessageHtml({
                type: 'chat',
                message: log.message,
                nickname: log.conversation_name,
                city: log.conversation_location,
                pictureUrl: log.pictureUrl || '',
                timestamp: log.updated_time,
                userId: log.conversation_id
            });
        }).join('');

        // 修正：使用 prepend 將歷史紀錄插入到頂部，而不是 empty 清除
        $('#chat-messages').prepend(historyHtml);
        console.log(`已載入 ${history.length} 筆歷史訊息。`);
    }
}


/**
 * 將一則訊息附加到聊天視窗。
 * @param {Object} data - 訊息資料。
 */
function appendChatMessage(data) {
    const $chatMessages = $('#chat-messages');
    if ($chatMessages.find(`[data-timestamp="${data.timestamp}"]`).length > 0) return;

    const messageHtml = buildMessageHtml(data);
    if (messageHtml) {
        $chatMessages.append(messageHtml);
        // 自動滾動到底部
        $chatMessages.scrollTop($chatMessages[0].scrollHeight);
    }
}

/**
 * 根據訊息資料建立 HTML 字串。
 * @param {Object} data - 訊息資料。
 * @returns {string} - HTML 字串。
 */
function buildMessageHtml(data) {
    const messageTime = new Date(data.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const sanitizedMessage = $('<div>').text(data.message || '').html();
    const sanitizedNickname = $('<div>').text(data.nickname || '匿名').html();

    switch (data.type) {
        case 'chat':
            return `
                <div class="chat-message-item flex items-start space-x-3 p-1 rounded-md hover:bg-gray-100" 
                     data-timestamp="${data.timestamp}" data-user-id="${data.userId || ''}" data-user-name="${sanitizedNickname}">
                    <img src="${data.pictureUrl || 'https://placehold.co/40x40/E2E8F0/A0AEC0?text=?'}" alt="avatar" class="w-8 h-8 rounded-full">
                    <div>
                        <div class="flex items-baseline space-x-2">
                            <span class="font-bold text-blue-600">${sanitizedNickname}</span>
                            <span class="text-xs text-gray-500">(${data.city || '未知'})</span>
                            <span class="text-xs text-gray-400">${messageTime}</span>
                        </div>
                        <p class="text-gray-800 break-words">${sanitizedMessage}</p>
                    </div>
                </div>`;
        case 'system_join':
        case 'system_leave':
        case 'system_name_change':
            return `<div class="text-center text-xs text-gray-500 italic py-1 system-message" data-timestamp="${data.timestamp}">${sanitizedMessage}</div>`;
        default:
            return '';
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
    if (message && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'chat', message }));
        $input.val('');
    }
}

/**
 * 處理右鍵選單事件。
 * @param {HTMLElement} element - 目標元素。
 * @param {number} x - 頁面 X 座標。
 * @param {number} y - 頁面 Y 座標。
 */
function handleContextMenu(element, x, y) {
    const $el = $(element);
    const userId = $el.data('user-id');
    const userName = $el.data('user-name');
    const profile = getUserProfile();

    if (!userId || userId === (profile.email || profile.lineUserId)) return;

    contextMenuTarget = { userId, userName };
    $('#context-mute-user').toggle(getIsAdmin());
    $('#chat-context-menu').css({ top: `${y}px`, left: `${x}px` }).removeClass('hidden');
}


/**
 * 處理禁言表單提交。
 */
async function handleMuteFormSubmit(e) {
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
        const result = await api.muteUserAPI(contextMenuTarget.userId, contextMenuTarget.userName, duration, getUserProfile());
        if (result.status === 'success') {
            showNotification(`${contextMenuTarget.userName} 已被禁言。`, 'success');
            $('#mute-user-modal').addClass('hidden');
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        showNotification(`禁言失敗: ${error.message}`, 'error');
    }
}


/**
 * 設置所有與聊天室相關的事件監聽器。
 */
export function setupChatListeners() {
    $('#open-chat-btn').on('click', () => {
        $('#chat-modal').removeClass('hidden');
        unreadChatCount = 0;
        $('#chat-unread-badge').addClass('hidden').text('');
        const $chatWindow = $('#chat-messages');
        setTimeout(() => $chatWindow.scrollTop($chatWindow[0].scrollHeight), 0);
    });
    $('#close-chat-modal').on('click', () => $('#chat-modal').addClass('hidden'));
    $('#send-chat-btn').on('click', sendChatMessage);
    $('#chat-input').on('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // 系統訊息開關
    $('#hide-system-msgs-checkbox').on('change', function() {
        $('#chat-messages').toggleClass('hide-system-messages', $(this).is(':checked'));
    });

    // 右鍵選單 (長按)
    let longPressTimer;
    $('#chat-messages')
        .on('contextmenu', '.chat-message-item', function(e) {
            e.preventDefault();
            handleContextMenu(this, e.pageX, e.pageY);
        })
        .on('touchstart', '.chat-message-item', function(e) {
            const targetElement = this;
            longPressTimer = setTimeout(() => {
                const touch = e.touches[0];
                handleContextMenu(targetElement, touch.pageX, touch.pageY);
            }, 500);
        })
        .on('touchend touchmove', '.chat-message-item', () => clearTimeout(longPressTimer));

    // 點擊頁面其他地方關閉選單
    $(document).on('click', () => $('#chat-context-menu').addClass('hidden'));
    
    // 禁言功能
    $('#context-mute-user').on('click', function(e) {
        e.preventDefault();
        $('#chat-context-menu').addClass('hidden');
        if (contextMenuTarget.userId) {
            $('#mute-user-name').text(contextMenuTarget.userName);
            $('#mute-user-modal').removeClass('hidden');
        }
    });
    $('#mute-user-form').on('submit', handleMuteFormSubmit);
    $('#cancel-mute-btn').on('click', () => $('#mute-user-modal').addClass('hidden'));
}

