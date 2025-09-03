// WebSocket Server
// 這是一個升級版的 Node.js WebSocket 伺服器，
// 支援聊天記錄、使用者加入/離開通知、暱稱變更、心跳機制，以及定時將聊天紀錄存檔至 Google Sheets。

const WebSocket = require('ws');
const fetch = require('node-fetch'); // NEW: 用於發送 HTTP 請求到 Google Apps Script

// --- 設定 ---
// !!! 重要：請將此處的網址替換為您自己部署的 Google Apps Script 網路應用程式網址 !!!
const APPS_SCRIPT_ARCHIVE_URL = 'https://script.google.com/macros/s/AKfycbz2EgbwYpKBEPRU_KI4w2WeAicVWDTNpOPtdIj-NrGF870tQzufnm_qCIqXfCSXwxaMZg/exec'; 
const ARCHIVE_INTERVAL = 1 * 60 * 1000; // 存檔間隔：5 分鐘

// 在 8080 連接埠上建立一個新的 WebSocket 伺服器。
const wss = new WebSocket.Server({ port: 8080 });

// --- 變數定義 ---
const messageHistory = []; // 記憶體中的聊天紀錄 (滾動視窗)
const messagesToArchive = []; // 待存檔的訊息佇列
const MAX_HISTORY = 200; // 記憶體中保留的訊息數量上限

console.log('WebSocket 伺服器已在連接埠 8080 上啟動...');
console.log(`每 ${ARCHIVE_INTERVAL / 60000} 分鐘會將訊息存檔到 Google Sheet。`);


// 將訊息廣播給所有已連線的客戶端。
wss.broadcast = function broadcast(data, sender) {
  wss.clients.forEach(function each(client) {
    // 將訊息發送給除了發送者以外的所有人。
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// --- NEW: 訊息存檔函式 ---
async function archiveMessages() {
    if (messagesToArchive.length === 0) {
        console.log('存檔檢查：沒有新訊息需要存檔。');
        return;
    }
    
    // 複製待存檔訊息，並清空原始佇列
    const messages = [...messagesToArchive];
    messagesToArchive.length = 0;

    console.log(`正在嘗試存檔 ${messages.length} 筆訊息...`);

    try {
        const response = await fetch(APPS_SCRIPT_ARCHIVE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'archive_chat',
                messages: messages
            })
        });
        
        // Google Apps Script 的 fetch 會觸發重新導向，所以直接檢查 text()
        const resultText = await response.text();
        const result = JSON.parse(resultText);

        if (result.status === 'success') {
            console.log(`成功存檔 ${messages.length} 筆訊息至 Google Sheet。`);
        } else {
            console.error('存檔至 Google Sheet 失敗:', result.message);
            // 存檔失敗，將訊息放回佇列以便下次重試
            messagesToArchive.unshift(...messages);
        }
    } catch (error) {
        console.error('呼叫 Google Apps Script 時發生網路錯誤:', error);
        // 發生錯誤，將訊息放回佇列
        messagesToArchive.unshift(...messages);
    }
}

// 設定定時器，每隔一段時間就執行存檔
setInterval(archiveMessages, ARCHIVE_INTERVAL);


// --- 連線處理 ---
// MODIFIED: 增加 req 參數以取得 IP
wss.on('connection', function connection(ws, req) {
  console.log('一個新的客戶端已連線。');
  
  // NEW: 取得 IP 位址
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  ws.ip = ip;
  
  ws.isAlive = true;

  ws.on('message', function incoming(message) {
    try {
      const messageString = message.toString('utf8');
      const data = JSON.parse(messageString);

      switch (data.type) {
        case 'join':
          ws.userId = data.userId; // NEW: 儲存使用者的唯一 ID (email 或 lineUserId)
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
          
          wss.broadcast(JSON.stringify(joinMessage), null); // 廣播給所有人 (包含自己)
          console.log(`${ws.nickname} (IP: ${ws.ip}) 已加入。`);
          break;

        case 'chat':
          const chatMessage = {
            type: 'chat',
            nickname: ws.nickname || '匿名',
            pictureUrl: ws.pictureUrl || '', 
            city: ws.city || '未知區域',
            message: data.message,
            timestamp: new Date().toISOString()
          };

          messageHistory.push(chatMessage);
          if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

          // NEW: 建立準備存檔到 Google Sheet 的物件
          const archiveEntry = {
              conversation_id: ws.userId,
              conversation_name: ws.nickname,
              conversation_type: 'public', // 目前都是公開聊天
              updated_time: chatMessage.timestamp,
              conversation_location: ws.city,
              ip: ws.ip
          };
          messagesToArchive.push(archiveEntry);

          wss.broadcast(JSON.stringify(chatMessage), ws);
          console.log(`來自 ${ws.nickname} 的訊息: ${data.message}`);
          break;
        
        case 'nickname_change':
          const oldNickname = ws.nickname;
          const newNickname = data.newName;
          ws.nickname = newNickname;

          const nameChangeMessage = {
            type: 'system_name_change',
            message: `${oldNickname} 現在改名為 ${newNickname}。`,
            timestamp: new Date().toISOString()
          };
          
          messageHistory.push(nameChangeMessage);
          if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
          
          wss.broadcast(JSON.stringify(nameChangeMessage), null); // 廣播給所有人
          console.log(`${oldNickname} 已改名為 ${newNickname}`);
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
    if (ws.nickname) {
      console.log(`${ws.nickname} 已斷線。`);
      const leaveMessage = {
        type: 'system_leave',
        message: `${ws.nickname} 離開了聊天室。`,
        timestamp: new Date().toISOString()
      };
      
      messageHistory.push(leaveMessage);
      if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
      
      wss.broadcast(JSON.stringify(leaveMessage), null);
    } else {
      console.log('一個未驗證的客戶端已斷線。');
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket 錯誤:', error);
  });
});

// --- 心跳檢查機制 (防止 Render 服務休眠) ---
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
