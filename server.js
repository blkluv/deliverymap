// --- 設定 ---

// NEW: 主要 App Script 的網址，用於讀取黑名單和屏蔽詞
const MAIN_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw93ckEaMhqOmcrsGiMFY3gkxQVLDlKItY_O-xmEaswKibQ8YlscrVjHuB2viTV0XZg/exec';
// 用於存檔的 App Script 網址
const APPS_SCRIPT_ARCHIVE_URL = 'https://script.google.com/macros/s/AKfycbzr_Xmv4WeUCDOjpZmXdHLwtWg4kAOhcMB0brJQWkzquFqOLjupnFcB7AvdQM022dqWrQ/exec'; 

const ARCHIVE_INTERVAL = 1 * 60 * 1000; // 存檔間隔：1 分鐘
const MODERATION_REFRESH_INTERVAL = 5 * 60 * 1000; // 管理資料更新間隔：5 分鐘

// WebSocket Server
const WebSocket = require('ws');
const fetch = require('node-fetch');

const wss = new WebSocket.Server({ port: 8080 });

// --- 變數定義 ---
const messageHistory = [];
const messagesToArchive = [];
const MAX_HISTORY = 200;

// NEW: 聊天室管理用變數
let blockedWords = [];
const inMemoryMutes = new Map(); // Key: userId, Value: { durationStr: string, mutedAt: number }

console.log('WebSocket 伺服器已在連接埠 8080 上啟動...');
console.log(`每 ${ARCHIVE_INTERVAL / 60000} 分鐘會將訊息存檔。`);
console.log(`每 ${MODERATION_REFRESH_INTERVAL / 60000} 分鐘會更新黑名單與屏蔽詞。`);


// --- 輔助函式 ---

// 將訊息廣播給所有已連線的客戶端
wss.broadcast = function broadcast(data, sender) {
  wss.clients.forEach(function each(client) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// NEW: 解析時間字串 (例如 "1d10m") 為毫秒
function parseDuration(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const daysMatch = durationStr.match(/(\d+)d/);
    const minutesMatch = durationStr.match(/(\d+)m/);
    const days = daysMatch ? parseInt(daysMatch[1], 10) : 0;
    const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
    return (days * 24 * 60 * 60 * 1000) + (minutes * 60 * 1000);
}

// NEW: 從 Google Sheet 取得黑名單與屏蔽詞
async function fetchModerationData() {
    console.log('正在從 Google Sheet 更新聊天室管理資料...');
    try {
        const response = await fetch(`${MAIN_APPS_SCRIPT_URL}?action=getChatModerationData&t=${new Date().getTime()}`);
        const data = await response.json();

        // 更新屏蔽詞列表
        if (data.blockedWords) {
            blockedWords = data.blockedWords;
            console.log(`已載入 ${blockedWords.length} 個屏蔽詞。`);
        }

        // 更新記憶體中的黑名單
        if (data.blacklist) {
            const blacklistFromSheet = data.blacklist;
            const currentMutedIds = new Set();

            blacklistFromSheet.forEach(user => {
                const userId = user.conversation_id;
                currentMutedIds.add(userId);
                
                if (!inMemoryMutes.has(userId)) {
                    // 偵測到新的被禁言使用者，紀錄當前時間
                    inMemoryMutes.set(userId, {
                        durationStr: user.TIME,
                        mutedAt: Date.now()
                    });
                    console.log(`偵測到新的被禁言使用者: ${user.conversation_name} (${userId})`);
                } else {
                    // 使用者已存在，檢查禁言時間是否有變
                    const existingMute = inMemoryMutes.get(userId);
                    if (existingMute.durationStr !== user.TIME) {
                        // 如果時間被管理員修改，重置計時器
                        inMemoryMutes.set(userId, {
                            durationStr: user.TIME,
                            mutedAt: Date.now()
                        });
                        console.log(`更新使用者 ${user.conversation_name} 的禁言時間。`);
                    }
                }
            });

            // 從記憶體中移除已經不在 Google Sheet 黑名單上的使用者
            for (const mutedId of inMemoryMutes.keys()) {
                if (!currentMutedIds.has(mutedId)) {
                    inMemoryMutes.delete(mutedId);
                    console.log(`使用者 ${mutedId} 已從禁言名單中移除。`);
                }
            }
             console.log(`已載入 ${inMemoryMutes.size} 位被禁言的使用者。`);
        }

    } catch (error) {
        console.error('更新聊天室管理資料失敗:', error);
    }
}


// 訊息存檔函式
async function archiveMessages() {
    if (messagesToArchive.length === 0) {
        return;
    }
    
    const messages = [...messagesToArchive];
    messagesToArchive.length = 0;
    console.log(`正在嘗試存檔 ${messages.length} 筆訊息...`);
    console.log('傳送至 Apps Script 的資料:', JSON.stringify({ action: 'archive_chat', messages: messages }, null, 2));

    try {
        const response = await fetch(APPS_SCRIPT_ARCHIVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'archive_chat', messages: messages })
        });
        
        const resultText = await response.text();
        const result = JSON.parse(resultText);

        if (result.status === 'success') {
            console.log(`成功存檔 ${messages.length} 筆訊息至 Google Sheet。`);
        } else {
            console.error('存檔至 Google Sheet 失敗:', result.message);
            messagesToArchive.unshift(...messages);
        }
    } catch (error) {
        console.error('呼叫 Google Apps Script 時發生網路錯誤:', error);
        messagesToArchive.unshift(...messages);
    }
}

// --- 伺服器啟動程序 ---
setInterval(archiveMessages, ARCHIVE_INTERVAL);
fetchModerationData(); // 啟動時立即執行一次
setInterval(fetchModerationData, MODERATION_REFRESH_INTERVAL); // 定期更新


// --- 連線處理 ---
wss.on('connection', function connection(ws, req) {
  console.log('一個新的客戶端已連線。');
  
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  ws.ip = ip;
  ws.isAlive = true;

  ws.on('message', function incoming(message) {
    try {
      const messageString = message.toString('utf8');
      const data = JSON.parse(messageString);

      switch (data.type) {
        case 'join':
          ws.userId = data.userId;
          ws.nickname = data.nickname;
          ws.pictureUrl = data.pictureUrl;
          ws.city = data.city;

          ws.send(JSON.stringify({ type: 'history', data: messageHistory }));

          const joinMessage = {
            type: 'system_join',
            message: `歡迎 ${ws.nickname} 加入聊天室。`,
            timestamp: new Date().toISOString()
          };
          
          messageHistory.push(joinMessage);
          if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
          
          wss.broadcast(JSON.stringify(joinMessage), null);
          console.log(`${ws.nickname} (IP: ${ws.ip}) 已加入。`);
          break;

        case 'chat':
          // --- MODIFIED: 新增聊天訊息管理檢查 ---
          // 1. 檢查使用者是否被禁言
          const muteInfo = inMemoryMutes.get(ws.userId);
          if (muteInfo) {
              const muteDuration = parseDuration(muteInfo.durationStr);
              const muteExpiresAt = muteInfo.mutedAt + muteDuration;
              if (Date.now() < muteExpiresAt) {
                  console.log(`已攔截來自被禁言使用者 ${ws.nickname} 的訊息。`);
                  ws.send(JSON.stringify({ type: 'system_error', message: '您目前被禁言中，訊息無法送出。' }));
                  return; // 攔截訊息，不往下執行
              } else {
                  // 禁言時間已到，自動解除
                  inMemoryMutes.delete(ws.userId);
                  console.log(`使用者 ${ws.nickname} 的禁言時間已到期。`);
              }
          }

          // 2. 檢查訊息是否包含屏蔽詞
          const hasBlockedWord = blockedWords.some(word => data.message.includes(word));
          if (hasBlockedWord) {
              console.log(`已攔截來自 ${ws.nickname} 包含屏蔽詞的訊息。`);
              ws.send(JSON.stringify({ type: 'system_error', message: '您的訊息包含不當言論，已遭攔截。' }));
              return; // 攔截訊息，不往下執行
          }
          // --- 檢查結束 ---

          const chatMessage = {
            type: 'chat',
            userId: ws.userId, // NEW: 在廣播中加入 userID
            nickname: ws.nickname || '匿名',
            pictureUrl: ws.pictureUrl || '', 
            city: ws.city || '未知區域',
            message: data.message,
            timestamp: new Date().toISOString()
          };

          messageHistory.push(chatMessage);
          if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
          
          const archiveEntry = {
              conversation_id: ws.userId,
              conversation_name: ws.nickname,
              conversation_type: 'public',
              updated_time: chatMessage.timestamp,
              conversation_location: ws.city,
              ip: ws.ip,
              message: chatMessage.message,
              pictureUrl: ws.pictureUrl || ''
          };
          messagesToArchive.push(archiveEntry);

          wss.broadcast(JSON.stringify(chatMessage), null); // MODIFIED: 廣播給所有人 (包含自己，以便更新 data-user-id)
          console.log(`來自 ${ws.nickname} 的訊息: ${data.message}`);
          break;
        
        case 'nickname_change':
          // ... (此處程式碼與您提供的一致，保持不變) ...
          break;

        case 'ping':
          ws.isAlive = true;
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.warn('收到未知的訊息類型:', data.type);
      }

    } catch (error) {
      console.error('無法解析訊息或處理時發生錯誤:', error);
    }
  });
  
  ws.on('close', () => {
    // ... (此處程式碼與您提供的一致，保持不變) ...
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket 錯誤:', error);
  });
});

// --- 心跳檢查機制 ---
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      console.log(`偵測到無回應的連線，正在終止: ${ws.nickname || '未驗證'}`);
      return ws.terminate();
    }
    ws.isAlive = false;
  });
}, 35000);

wss.on('close', function close() {
  clearInterval(interval);
});

