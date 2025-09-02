// WebSocket Server
// 這是一個升級版的 Node.js WebSocket 伺服器，
// 支援聊天記錄、使用者加入/離開通知、暱稱變更、以及防止 Render 休眠的心跳機制。

const WebSocket = require('ws');

// 在 8080 連接埠上建立一個新的 WebSocket 伺服器。
const wss = new WebSocket.Server({ port: 8080 });

// --- 變數定義 ---
const messageHistory = [];
const MAX_HISTORY = 200; // 保留的訊息數量上限

console.log('WebSocket 伺服器已在連接埠 8080 上啟動...');

// 將訊息廣播給所有已連線的客戶端。
wss.broadcast = function broadcast(data, sender) {
  wss.clients.forEach(function each(client) {
    // 將訊息發送給除了發送者以外的所有人。
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// --- 連線處理 ---
wss.on('connection', function connection(ws) {
  console.log('一個新的客戶端已連線。');
  
  // NEW: 為每個連線設定 isAlive 狀態，用於心跳檢查
  ws.isAlive = true;

  // 監聽來自此客戶端的訊息。
  ws.on('message', function incoming(message) {
    try {
      const messageString = message.toString('utf8');
      const data = JSON.parse(messageString);

      // --- 根據訊息類型做不同處理 ---
      switch (data.type) {
        case 'join':
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
          
          wss.broadcast(JSON.stringify(joinMessage), ws); // 廣播給其他人
          console.log(`${ws.nickname} 已加入。`);
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

          // 廣播給所有其他客戶端
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
          
          wss.broadcast(JSON.stringify(nameChangeMessage), ws);
          console.log(`${oldNickname} 已改名為 ${newNickname}`);
          break;

        case 'ping':
          ws.isAlive = true; // NEW: 收到 ping 後，重設 isAlive 狀態
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
      
      // 將離開訊息廣播給所有還在線上的客戶端
      wss.broadcast(JSON.stringify(leaveMessage), null); // sender 為 null 表示廣播給所有人
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
    // 將所有連線設為 false，等待下一次的 ping 來重設為 true
    ws.isAlive = false;
  });
}, 35000); // 每 35 秒檢查一次

// 當伺服器關閉時，清除定時器
wss.on('close', function close() {
  clearInterval(interval);
});

