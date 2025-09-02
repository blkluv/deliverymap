// WebSocket Server
// 這是一個升級版的 Node.js WebSocket 伺服器，
// 支援聊天記錄、使用者加入/離開通知等功能。

const WebSocket = require('ws');

// 在 8080 連接埠上建立一個新的 WebSocket 伺服器。
// 您可以根據需要更改連接埠。
const wss = new WebSocket.Server({ port: 8080 });

// --- 新增功能：儲存聊天記錄 ---
const messageHistory = [];
const MAX_HISTORY = 200; // 設定要保留的訊息數量上限

console.log('WebSocket 伺服器已在連接埠 8080 上啟動...');

// MODIFIED: 這個函式現在會將訊息廣播給所有已連線的客戶端，包含發送者自己。
wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// 監聽新的客戶端連線。
wss.on('connection', function connection(ws) {
  console.log('一個新的客戶端已連線。');

  // 監聽來自此客戶端的訊息。
  ws.on('message', function incoming(message) {
    try {
      const messageString = message.toString('utf8');
      const data = JSON.parse(messageString);

      // --- 新增功能：根據訊息類型做不同處理 ---
      switch (data.type) {
        // 處理使用者加入的訊息
        case 'join':
          // 在連線物件上儲存使用者資訊
          ws.nickname = data.nickname;
          ws.pictureUrl = data.pictureUrl;
          ws.city = data.city; // 儲存城市資訊

          // 1. 馬上將歷史訊息傳送給這位剛連線的使用者
          ws.send(JSON.stringify({ type: 'history', data: messageHistory }));

          // 2. 建立歡迎訊息，並廣播給聊天室中的所有人
          const joinMessage = {
            type: 'system_join',
            nickname: ws.nickname,
            pictureUrl: ws.pictureUrl,
            message: `歡迎 ${ws.nickname} 加入聊天室。`,
            timestamp: new Date().toISOString()
          };
          
          // 將歡迎訊息也加入歷史記錄
          messageHistory.push(joinMessage);
          if (messageHistory.length > MAX_HISTORY) {
            messageHistory.shift(); // 保持歷史記錄在200則以內
          }
          
          // MODIFIED: 廣播給包含發送者在內的所有人
          wss.broadcast(JSON.stringify(joinMessage)); 
          console.log(`${ws.nickname} 已加入。`);
          break;

        // 處理一般的聊天訊息
        case 'chat':
          // 建立包含使用者資訊的完整訊息物件
          const chatMessage = {
            type: 'chat',
            nickname: ws.nickname || '匿名', // 提供預設值以防萬一
            pictureUrl: ws.pictureUrl || '', 
            city: ws.city || '未知區域', // 附上城市資訊
            message: data.message,
            timestamp: new Date().toISOString()
          };

          // 將聊天訊息加入歷史記錄
          messageHistory.push(chatMessage);
          if (messageHistory.length > MAX_HISTORY) {
            messageHistory.shift(); 
          }

          // MODIFIED: 廣播給包含發送者在內的所有人
          wss.broadcast(JSON.stringify(chatMessage));
          console.log(`來自 ${ws.nickname} 的訊息: ${data.message}`);
          break;
        
        // --- 新增功能：處理心跳機制 ---
        case 'ping':
          // 當收到客戶端的 ping 時，回傳一個 pong
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.warn('收到未知的訊息類型:', data.type);
      }

    } catch (error) {
      console.error('無法解析訊息或處理時發生錯誤:', error);
    }
  });
  
  // --- 新增功能：處理客戶端斷線 ---
  ws.on('close', () => {
    // 只有在使用者成功 "join" 之後才廣播離開訊息
    if (ws.nickname) {
      console.log(`${ws.nickname} 已斷線。`);
      const leaveMessage = {
        type: 'system_leave',
        nickname: ws.nickname,
        message: `${ws.nickname} 離開了聊天室。`,
        timestamp: new Date().toISOString()
      };
      
      messageHistory.push(leaveMessage);
      if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift();
      }
      
      // MODIFIED: 廣播給所有還在線上的客戶端
      wss.broadcast(JSON.stringify(leaveMessage));
    } else {
      console.log('一個未驗證的客戶端已斷線。');
    }
  });
  
  // 處理錯誤。
  ws.on('error', (error) => {
    console.error('WebSocket 錯誤:', error);
  });
});

