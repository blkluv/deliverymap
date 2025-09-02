// WebSocket Server
// 這是一個簡單的 Node.js WebSocket 伺服器，用於廣播聊天訊息。

const WebSocket = require('ws');

// 在 8080 連接埠上建立一個新的 WebSocket 伺服器。
// 您可以根據需要更改連接埠。
const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket 伺服器已在連接埠 8080 上啟動...');

// 這個函式會將收到的訊息廣播給所有已連線的客戶端。
wss.broadcast = function broadcast(data, sender) {
  wss.clients.forEach(function each(client) {
    // 將訊息發送給除了發送者以外的所有人。
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      // 傳送字串資料。
      client.send(data);
    }
  });
};

// 監聽新的客戶端連線。
wss.on('connection', function connection(ws) {
  console.log('一個新的客戶端已連線。');

  // 監聽來自此客戶端的訊息。
  ws.on('message', function incoming(message) {
    // 將收到的訊息 (可能是 Buffer) 轉換為 UTF-8 字串。
    const messageString = message.toString('utf8');
    console.log('收到訊息字串: %s', messageString);
    
    // 將字串訊息廣播給所有其他客戶端。
    wss.broadcast(messageString, ws);
  });
  
  // 處理客戶端斷線。
  ws.on('close', () => {
    console.log('一個客戶端已斷線。');
  });
  
  // 處理錯誤。
  ws.on('error', (error) => {
    console.error('WebSocket 錯誤:', error);
  });
});

