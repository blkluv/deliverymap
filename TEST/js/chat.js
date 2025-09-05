import { state } from './state.js';
import { WEBSOCKET_URL, CHAT_APPS_SCRIPT_URL } from './config.js';
import { showNotification } from './ui.js';

// 加入聊天室
export function sendJoinMessage() {
    // ... ws.send join message ...
}

// 附加聊天訊息到畫面上
function appendChatMessage(data) {
    // ... append message HTML to #chat-messages ...
}

// 初始化 WebSocket
export function initializeChat() {
    // ... new WebSocket(...) ...
    // ... 設定 onopen, onmessage, onclose, onerror ...

    // 綁定聊天室 UI 事件
    $('#open-chat-btn').on('click', () => {
        // ... show chat modal and reset unread count ...
    });
    $('#close-chat-modal').on('click', () => $('#chat-modal').addClass('hidden'));
    $('#send-chat-btn').on('click', () => {
        // ... sendChatMessage logic ...
    });
}
