import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ 
  server,
  // Add CORS headers for WebSocket
  verifyClient: (info, cb) => {
    const origin = info.origin || info.req.headers.origin;
    cb(true); // Accept all origins in development
  }
});

// Enable CORS for Express
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const rooms = new Map();

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  let currentRoom = null;
  
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data);
      
      switch (data.type) {
        case 'create':
          currentRoom = data.room;
          console.log('Creating room:', currentRoom);
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Set());
          }
          rooms.get(currentRoom).add(ws);
          ws.send(JSON.stringify({ type: 'connected' }));
          break;

        case 'join':
          currentRoom = data.room;
          console.log('Joining room:', currentRoom);
          if (rooms.has(currentRoom)) {
            rooms.get(currentRoom).add(ws);
            ws.send(JSON.stringify({ type: 'connected' }));
          }
          break;

        case 'transcript':
          if (currentRoom && rooms.has(currentRoom)) {
            console.log('Broadcasting transcript in room:', currentRoom);
            rooms.get(currentRoom).forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'transcript',
                  text: data.text
                }));
              }
            });
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from room:', currentRoom);
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);
      if (rooms.get(currentRoom).size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating inactive client');
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});
