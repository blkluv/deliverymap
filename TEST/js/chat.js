import { state } from './state.js';
import { WEBSOCKET_URL, CHAT_APPS_SCRIPT_URL } from './config.js';
import { showNotification } from './ui.js';

let heartbeatInterval = null;

export function sendJoinMessage() {
    if (state.isLoggedIn && state.ws && state.ws.readyState === WebSocket.OPEN) {
        const payload = {
            type: 'join',
            userId: state.userProfile.email || state.userProfile.lineUserId,
            nickname: state.currentUserDisplayName,
            pictureUrl: state.userProfile.pictureUrl || '',
            city: state.currentUserCity
        };
        state.ws.send(JSON.stringify(payload));
    }
}

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
                    <div class="flex-grow">
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
    if (messageHtml) $chatMessages.append(messageHtml);
}

export async function loadArchivedChatHistory() {
    if (!state.isLoggedIn || !CHAT_APPS_SCRIPT_URL.startsWith('https')) return;
    try {
        const response = await fetch(`${CHAT_APPS_SCRIPT_URL}?action=get_chat_history&t=${new Date().getTime()}`);
        const history = await response.json();
        
        if (Array.isArray(history) && history.length > 0) {
            $('#chat-messages').empty();
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
            const $chatMessages = $('#chat-messages');
            $chatMessages.scrollTop($chatMessages[0].scrollHeight);
        }
    } catch (error) {
        console.error("無法載入歷史聊天紀錄:", error);
        showNotification('載入歷史聊天紀錄失敗', 'error');
    }
}

export function sendChatMessage() {
    if (!state.isLoggedIn) {
        showNotification('請先登入才能發言！', 'warning');
        return;
    }
    const $input = $('#chat-input');
    const message = $input.val().trim();
    if (message && state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'chat', message: message }));
        $input.val('');
    }
}

export function initializeChat() {
    function connect() {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) return;
        state.ws = new WebSocket(WEBSOCKET_URL);
        state.ws.onopen = () => {
            console.log('聊天室已連線。');
            sendJoinMessage();
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                    state.ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);
        };
        state.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'history': break; // Ignore history from WebSocket
                    case 'chat':
                    case 'system_join':
                    case 'system_leave':
                    case 'system_name_change':
                        if (data.type === 'chat' && $('#chat-modal').hasClass('hidden')) {
                            state.unreadChatCount++;
                            $('#chat-unread-badge').text(state.unreadChatCount).removeClass('hidden');
                        }
                        appendChatMessage(data);
                        const $chatWindow = $('#chat-messages');
                        $chatWindow.scrollTop($chatWindow[0].scrollHeight);
                        break;
                    case 'pong': break;
                    default: console.warn("收到未知的訊息類型:", data.type);
                }
            } catch (e) {
                console.error("無法解析收到的訊息:", event.data, e);
            }
        };
        state.ws.onclose = () => {
            console.log('聊天室連線已中斷，3秒後嘗試重新連線...');
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            setTimeout(connect, 3000);
        };
        state.ws.onerror = (error) => {
            console.error('WebSocket 錯誤:', error);
            state.ws.close();
        };
    }
    connect();
}
