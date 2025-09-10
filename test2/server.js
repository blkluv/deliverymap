// --- 設定 ---
const APPS_SCRIPT_ARCHIVE_URL = 'https://script.google.com/macros/s/AKfycbzr_Xmv4WeUCDOjpZmXdHLwtWg4kAOhcMB0brJQWkzquFqOLjupnFcB7AvdQM022dqWrQ/exec';
const ARCHIVE_INTERVAL = 1 * 60 * 1000;
const MODERATION_REFRESH_INTERVAL = 5 * 60 * 1000;

// --- 模組匯入 ---
const WebSocket = require('ws');
const fetch = require('node-fetch');
const { Storage } = require('@google-cloud/storage');
const path = require('path');

// --- Google Cloud Storage 設定 ---
// !!! 重要：請將 'your-gcs-bucket-name' 替換成您在 GCP 建立的儲存空間名稱 !!!
const BUCKET_NAME = 'chat_photo';
const KEY_FILE_PATH = path.join(__dirname, 'gcs-key.json');

let storage;
try {
    storage = new Storage({ keyFilename: KEY_FILE_PATH });
    console.log("Google Cloud Storage 金鑰成功載入。");
} catch (error) {
    console.error("!!!!!!!!!!!! GCS 金鑰檔案讀取失敗 !!!!!!!!!!!!");
    console.error("請確認 'gcs-key.json' 檔案已放置在與 server.js 同一個資料夾中。");
    console.error(error.message);
    process.exit(1); // 結束程式
}

// --- WebSocket 伺服器設定 ---
const wss = new WebSocket.Server({ port: 8080 });

// --- 變數定義 ---
const messageHistory = [];
const messagesToArchive = [];
const MAX_HISTORY = 200;
let blockedWords = [];
const inMemoryMutes = new Map();

console.log('WebSocket 伺服器已在連接埠 8080 上啟動...');

// --- 輔助函式 ---
wss.broadcast = function broadcast(data, sender) {
  wss.clients.forEach(function each(client) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

function parseDuration(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const daysMatch = durationStr.match(/(\d+)d/);
    const minutesMatch = durationStr.match(/(\d+)m/);
    const days = daysMatch ? parseInt(daysMatch[1], 10) : 0;
    const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
    return (days * 24 * 60 * 60 * 1000) + (minutes * 60 * 1000);
}

async function generateV4UploadSignedUrl(fileName) {
  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 分鐘後過期
    contentType: 'application/octet-stream',
  };
  const [url] = await storage.bucket(BUCKET_NAME).file(fileName).getSignedUrl(options);
  return url;
}

async function fetchModerationData() {
    console.log('正在從 Google Sheet 更新聊天室管理資料...');
    try {
        const response = await fetch(`${APPS_SCRIPT_ARCHIVE_URL}?action=getChatModerationData&t=${new Date().getTime()}`);
        const data = await response.json();
        if (data.blockedWords) {
            blockedWords = data.blockedWords;
            console.log(`已載入 ${blockedWords.length} 個屏蔽詞。`);
        }
        if (data.blacklist) {
            const blacklistFromSheet = data.blacklist;
            const currentMutedIds = new Set();
            blacklistFromSheet.forEach(user => {
                const userId = user.conversation_id;
                currentMutedIds.add(userId);
                if (!inMemoryMutes.has(userId) || inMemoryMutes.get(userId).durationStr !== user.TIME) {
                    inMemoryMutes.set(userId, { durationStr: user.TIME, mutedAt: Date.now() });
                    console.log(`已更新被禁言使用者: ${user.conversation_name} (${userId})`);
                }
            });
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

async function archiveMessages() {
    if (messagesToArchive.length === 0) return;
    const messages = [...messagesToArchive];
    messagesToArchive.length = 0;
    console.log(`正在嘗試存檔 ${messages.length} 筆訊息...`);
    try {
        const response = await fetch(APPS_SCRIPT_ARCHIVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'archive_chat', messages: messages })
        });
        const result = await response.json();
        if (result.status === 'success') {
            console.log(`成功存檔 ${messages.length} 筆訊息。`);
        } else {
            console.error('存檔至 Google Sheet 失敗:', result.message);
            messagesToArchive.unshift(...messages);
        }
    } catch (error) {
        console.error('呼叫存檔 API 時發生網路錯誤:', error);
        messagesToArchive.unshift(...messages);
    }
}

// --- 伺服器啟動程序 ---
setInterval(archiveMessages, ARCHIVE_INTERVAL);
fetchModerationData();
setInterval(fetchModerationData, MODERATION_REFRESH_INTERVAL);

// --- 連線處理 ---
wss.on('connection', function connection(ws, req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  ws.ip = ip;
  ws.isAlive = true;
  console.log(`一個新的客戶端已連線 (IP: ${ip})。`);

  ws.on('message', async function incoming(message) {
    try {
      const data = JSON.parse(message.toString('utf8'));

      const muteInfo = inMemoryMutes.get(ws.userId);
      if (muteInfo) {
          const muteDuration = parseDuration(muteInfo.durationStr);
          if (Date.now() < muteInfo.mutedAt + muteDuration) {
              if (data.type !== 'ping') { // 允許被禁言者 ping
                console.log(`已攔截來自被禁言使用者 ${ws.nickname} 的訊息。`);
                ws.send(JSON.stringify({ type: 'system_error', message: '您目前被禁言中，無法發送訊息。' }));
                return;
              }
          } else {
              inMemoryMutes.delete(ws.userId);
              console.log(`使用者 ${ws.nickname} 的禁言時間已到期。`);
          }
      }

      switch (data.type) {
        case 'join':
          ws.userId = data.userId;
          ws.nickname = data.nickname;
          ws.pictureUrl = data.pictureUrl;
          ws.city = data.city;
          ws.send(JSON.stringify({ type: 'history', data: messageHistory }));
          const joinMessage = { type: 'system_join', message: `歡迎 ${ws.nickname} 加入聊天室。`, timestamp: new Date().toISOString() };
          messageHistory.push(joinMessage);
          if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
          wss.broadcast(JSON.stringify(joinMessage), null);
          console.log(`${ws.nickname} (IP: ${ws.ip}) 已加入。`);
          break;
        
        case 'get_upload_url':
          if (data.fileName) {
            try {
              const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${data.fileName}`;
              const signedUrl = await generateV4UploadSignedUrl(uniqueFileName);
              const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${uniqueFileName}`;
              ws.send(JSON.stringify({ type: 'upload_url_response', signedUrl: signedUrl, publicUrl: publicUrl }));
            } catch (error) {
              console.error('產生 Signed URL 失敗:', error);
              ws.send(JSON.stringify({ type: 'system_error', message: '無法產生圖片上傳連結。' }));
            }
          }
          break;

        case 'chat':
        case 'image':
          const messageContent = data.message || data.imageUrl;
          if (!messageContent) return;

          if (data.type === 'chat' && blockedWords.some(word => messageContent.includes(word))) {
              console.log(`已攔截來自 ${ws.nickname} 包含屏蔽詞的訊息。`);
              ws.send(JSON.stringify({ type: 'system_error', message: '您的訊息包含不當言論，已遭攔截。' }));
              return;
          }

          const messageObject = {
            type: data.type, // 'chat' or 'image'
            userId: ws.userId,
            nickname: ws.nickname || '匿名',
            pictureUrl: ws.pictureUrl || '',
            city: ws.city || '未知區域',
            message: data.type === 'chat' ? messageContent : undefined,
            imageUrl: data.type === 'image' ? messageContent : undefined,
            timestamp: new Date().toISOString()
          };

          messageHistory.push(messageObject);
          if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

          const archiveEntry = {
              conversation_id: ws.userId,
              conversation_name: ws.nickname,
              conversation_type: 'public',
              updated_time: messageObject.timestamp,
              conversation_location: ws.city,
              ip: ws.ip,
              message: messageContent, // 統一存到 message 欄位
              pictureUrl: ws.pictureUrl || ''
          };
          messagesToArchive.push(archiveEntry);

          wss.broadcast(JSON.stringify(messageObject), null); // 將訊息廣播給所有人，包括自己
          console.log(`來自 ${ws.nickname} 的 ${data.type} 訊息`);
          break;
        
        case 'nickname_change':
          const oldNickname = ws.nickname;
          const newNickname = data.newName;
          if (oldNickname && newNickname && oldNickname !== newNickname) {
            ws.nickname = newNickname;
            const changeMessage = { type: 'system_name_change', message: `${oldNickname} 已將名稱改為 ${newNickname}。`, timestamp: new Date().toISOString() };
            messageHistory.push(changeMessage);
            if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
            wss.broadcast(JSON.stringify(changeMessage), null);
            console.log(`${oldNickname} 已將名稱改為 ${newNickname}。`);
          }
          break;

        case 'ping':
          ws.isAlive = true;
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.warn(`收到未知的訊息類型: ${data.type}`);
      }
    } catch (error) {
      console.error('無法解析訊息或處理時發生錯誤:', error);
    }
  });
  
  ws.on('close', () => {
    if (ws.nickname) {
        const leaveMessage = { type: 'system_leave', message: `${ws.nickname} 已離開聊天室。`, timestamp: new Date().toISOString() };
        messageHistory.push(leaveMessage);
        if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
        wss.broadcast(JSON.stringify(leaveMessage), null);
        console.log(`${ws.nickname} (IP: ${ws.ip}) 已斷開連線。`);
    } else {
        console.log(`一個未驗證的客戶端 (IP: ${ws.ip}) 已斷開連線。`);
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket 錯誤 (IP: ${ws.ip}):`, error);
  });
});

// --- 心跳檢查機制 ---
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      console.log(`偵測到無回應的連線，正在終止: ${ws.nickname || ws.ip}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    try {
        ws.ping();
    } catch (e) {
        console.error("Ping 失敗:", e);
    }
  });
}, 35000);

wss.on('close', function close() {
  clearInterval(interval);
});

