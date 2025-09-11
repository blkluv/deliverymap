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
let historyPromise = null;
let hasHistoryBeenLoaded = false;
let uploadUrlResolver = null;

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
            heartbeatInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'upload_url_response':
                        if (uploadUrlResolver) {
                            uploadUrlResolver(data);
                            uploadUrlResolver = null;
                        }
                        break;
                    case 'history':
                        // 由 loadArchivedChatHistoryOnce 處理，此處忽略
                        break;
                    case 'chat':
                    case 'image':
                    case 'system_join':
                    case 'system_leave':
                    case 'system_name_change':
                    case 'system_error':
                        if ($('#chat-modal').hasClass('hidden') && data.type !== 'system_error') {
                            unreadChatCount++;
                            $('#chat-unread-badge').text(unreadChatCount).removeClass('hidden');
                        }
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

        ws.onclose = () => {
            console.log('聊天室連線已中斷，3秒後嘗試重新連線...');
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            setTimeout(connect, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket 錯誤:', error);
            ws.close(); // 觸發 onclose 中的重連邏輯
        };
    }
    connect();
}

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

export function preloadHistory() {
    if (!historyPromise && getLoginStatus()) {
        historyPromise = api.getArchivedChatHistory().catch(err => {
            console.error("聊天歷史紀錄預載失敗:", err);
            historyPromise = null;
        });
    }
}

async function loadArchivedChatHistoryOnce() {
    if (hasHistoryBeenLoaded || !getLoginStatus()) return;
    
    const $chatMessages = $('#chat-messages');
    $chatMessages.empty().append('<div class="text-center text-gray-500 italic p-4">正在載入歷史訊息...</div>');

    try {
        if (!historyPromise) preloadHistory();
        const history = await historyPromise;
        $chatMessages.empty();

        if (Array.isArray(history) && history.length > 0) {
            history.forEach(log => appendChatMessage({
                type: log.message.startsWith('https://') ? 'image' : 'chat',
                message: log.message.startsWith('https://') ? undefined : log.message,
                imageUrl: log.message.startsWith('https://') ? log.message : undefined,
                nickname: log.conversation_name,
                city: log.conversation_location,
                pictureUrl: log.pictureUrl || '',
                timestamp: log.updated_time,
                userId: log.conversation_id,
            }, true)); // 傳入 isHistory = true，避免捲動
        }
        hasHistoryBeenLoaded = true;
    } catch (error) {
        console.error("無法載入歷史聊天紀錄:", error);
        $chatMessages.html('<div class="text-center text-red-500 italic p-4">載入歷史紀錄失敗，請稍後再試。</div>');
    } finally {
        $chatMessages.scrollTop($chatMessages[0].scrollHeight);
    }
}

function appendChatMessage(data, isHistory = false) {
    const $chatMessages = $('#chat-messages');
    if (data.timestamp && $chatMessages.find(`[data-timestamp="${data.timestamp}"]`).length > 0) return;
    
    const time = new Date(data.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    let messageHtml = '';
    
    if (data.type.startsWith('system')) {
        const colorClass = data.type === 'system_error' ? 'text-red-500' : 'text-gray-500';
        messageHtml = `<div class="text-center text-xs ${colorClass} italic py-1 system-message" data-timestamp="${data.timestamp}">${$('<div>').text(data.message).html()}</div>`;
    } else {
        const sanitizedNick = $('<div>').text(data.nickname || '匿名').html();
        const sanitizedCity = $('<div>').text(data.city || '未知').html();
        const pictureUrl = data.pictureUrl || 'https://placehold.co/40x40/E2E8F0/A0AEC0?text=?';
        let contentHtml = '';

        if (data.type === 'image' && data.imageUrl) {
            contentHtml = `<a href="${data.imageUrl}" target="_blank" rel="noopener noreferrer"><img src="${data.imageUrl}" class="chat-image" alt="使用者上傳的圖片"></a>`;
        } else {
            contentHtml = `<p class="text-gray-800 break-words">${$('<div>').text(data.message).html()}</p>`;
        }
        
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
                    ${contentHtml}
                </div>
            </div>`;
    }
    
    // 修正：無論使用者在哪，收到新訊息都自動捲動到底部
    $chatMessages.append(messageHtml);
    if (!isHistory) {
        $chatMessages.scrollTop($chatMessages[0].scrollHeight);
    }
}

function sendChatMessage() {
    const $input = $('#chat-input');
    const message = $input.val().trim();
    if (message) {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'chat', message }));
            $input.val('');
        } else {
            showNotification('聊天室尚未連線，請稍後再試。', 'error');
        }
    }
}

async function uploadImageToGCS(file) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showNotification('無法上傳圖片：聊天室尚未連線。', 'error');
        return;
    }
    showNotification('正在準備上傳圖片...', 'info');
    try {
        ws.send(JSON.stringify({ type: 'get_upload_url', fileName: file.name }));
        const { signedUrl, publicUrl } = await new Promise((resolve, reject) => {
            uploadUrlResolver = resolve;
            setTimeout(() => reject(new Error('取得上傳連結超時')), 10000);
        });

        if (!signedUrl || !publicUrl) throw new Error('從伺服器收到的上傳連結無效。');
        showNotification('正在上傳圖片...', 'info');

        const response = await fetch(signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: file,
        });

        if (!response.ok) throw new Error(`上傳失敗，狀態碼: ${response.status}`);

        showNotification('圖片上傳成功！', 'success');
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'image', message: publicUrl }));
        }
    } catch (error) {
        console.error('GCS 上傳失敗:', error);
        showNotification(`圖片上傳失敗: ${error.message}`, 'error');
        uploadUrlResolver = null;
    }
}

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

export function setupChatListeners() {
    let longPressTimer;

    $('#open-chat-btn').on('click', () => {
        $('#chat-modal').removeClass('hidden');
        loadArchivedChatHistoryOnce();
        unreadChatCount = 0;
        $('#chat-unread-badge').addClass('hidden').text('');
        setTimeout(() => $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight), 50);
    });
    $('#close-chat-modal').on('click', () => $('#chat-modal').addClass('hidden'));
    $('#send-chat-btn').on('click', sendChatMessage);
    $('#chat-input').on('keydown', e => e.key === 'Enter' && (e.preventDefault(), sendChatMessage()));
    $('#hide-system-msgs-checkbox').on('change', (e) => $('#chat-messages').toggleClass('hide-system-messages', e.target.checked));

    $('#upload-image-btn').on('click', () => {
        if (!getLoginStatus()) {
            triggerLogin();
            return;
        }
        $('#image-upload-input').trigger('click');
    });

    $('#image-upload-input').on('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            uploadImageToGCS(file);
        }
        $(this).val('');
    });

    $('#chat-messages').on('contextmenu touchstart', '.chat-message-item', function(e) {
        e.preventDefault();
        const targetElement = this;
        if (e.type === 'touchstart') {
            longPressTimer = setTimeout(() => handleContextMenu(targetElement, e.touches[0].pageX, e.touches[0].pageY), 500);
        } else {
            handleContextMenu(targetElement, e.pageX, e.pageY);
        }
    }).on('touchend touchmove', () => clearTimeout(longPressTimer));

    $(document).on('click', () => $('#chat-context-menu').addClass('hidden'));
    
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
