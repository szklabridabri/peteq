const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Konfiguracja multer dla przesyłania plików
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Funkcje pomocnicze do zarządzania danymi
const dataDir = './data';
const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
};

const readJSON = (filename) => {
  ensureDataDir();
  const filepath = path.join(dataDir, filename);
  if (fs.existsSync(filepath)) {
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (error) {
      console.error(`Error reading ${filename}:`, error);
      return {};
    }
  }
  return {};
};

const writeJSON = (filename, data) => {
  ensureDataDir();
  const filepath = path.join(dataDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
};

// WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });
const connectedClients = new Map();

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  connectedClients.set(clientId, ws);
  console.log(`Client connected: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(clientId, data);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    connectedClients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

function handleWebSocketMessage(clientId, data) {
  const { type, payload } = data;
  
  switch (type) {
    case 'TRADE_OFFER':
      broadcastToAll({ type: 'TRADE_UPDATE', payload });
      break;
    case 'CLAN_MESSAGE':
      broadcastToClan(payload.clanId, { type: 'CLAN_CHAT', payload });
      break;
    case 'GLOBAL_MESSAGE':
      broadcastToAll({ type: 'GLOBAL_CHAT', payload });
      break;
  }
}

function broadcastToAll(message) {
  connectedClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function broadcastToClan(clanId, message) {
  connectedClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // W rzeczywistej aplikacji sprawdzalibyśmy przynależność do klanu
      client.send(JSON.stringify(message));
    }
  });
}

// API Routes

// Pobierz dane gry użytkownika
app.get('/api/game/:playerId', (req, res) => {
  const { playerId } = req.params;
  const games = readJSON('games.json');
  const gameData = games[playerId] || createNewGame(playerId);
  
  res.json(gameData);
});

// Zapisz dane gry
app.post('/api/game/:playerId', (req, res) => {
  const { playerId } = req.params;
  const gameData = req.body;
  
  const games = readJSON('games.json');
  games[playerId] = {
    ...gameData,
    lastSaved: new Date().toISOString()
  };
  writeJSON('games.json', games);
  
  res.json({ success: true, message: 'Game saved successfully' });
});

// Pobierz listę klanów
app.get('/api/clans', (req, res) => {
  const clans = readJSON('clans.json');
  res.json(Object.values(clans));
});

// Stwórz nowy klan
app.post('/api/clans', (req, res) => {
  const { name, playerId, playerName } = req.body;
  const clans = readJSON('clans.json');
  const clanId = uuidv4();
  
  const newClan = {
    id: clanId,
    name,
    level: 1,
    experience: 0,
    members: [{
      id: playerId,
      name: playerName,
      role: 'leader',
      joinDate: new Date().toISOString()
    }],
    created: new Date().toISOString()
  };
  
  clans[clanId] = newClan;
  writeJSON('clans.json', clans);
  
  res.json({ success: true, clan: newClan });
});

// Dołącz do klanu
app.post('/api/clans/:clanId/join', (req, res) => {
  const { clanId } = req.params;
  const { playerId, playerName } = req.body;
  const clans = readJSON('clans.json');
  
  if (!clans[clanId]) {
    return res.status(404).json({ success: false, message: 'Clan not found' });
  }
  
  clans[clanId].members.push({
    id: playerId,
    name: playerName,
    role: 'member',
    joinDate: new Date().toISOString()
  });
  
  writeJSON('clans.json', clans);
  res.json({ success: true, clan: clans[clanId] });
});

// System handlu
app.get('/api/trades', (req, res) => {
  const trades = readJSON('trades.json');
  res.json(Object.values(trades));
});

app.post('/api/trades', (req, res) => {
  const trade = req.body;
  const trades = readJSON('trades.json');
  const tradeId = uuidv4();
  
  trades[tradeId] = {
    ...trade,
    id: tradeId,
    created: new Date().toISOString(),
    status: 'active'
  };
  
  writeJSON('trades.json', trades);
  
  // Powiadom wszystkich przez WebSocket
  broadcastToAll({
    type: 'NEW_TRADE',
    payload: trades[tradeId]
  });
  
  res.json({ success: true, trade: trades[tradeId] });
});

// Przesyłanie obrazów/plików
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  
  res.json({
    success: true,
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`
  });
});

// Pobierz historię gry
app.get('/api/history/:playerId', (req, res) => {
  const { playerId } = req.params;
  const games = readJSON('games.json');
  const gameData = games[playerId];
  
  if (!gameData) {
    return res.status(404).json({ success: false, message: 'Player not found' });
  }
  
  res.json(gameData.gameHistory || []);
});

// Funkcja tworząca nową grę
function createNewGame(playerId) {
  const newGame = {
    playerId,
    money: 0,
    totalMoney: 0,
    breakablesDestroyed: 0,
    keys: 0,
    gifts: 0,
    pets: [{
      id: 1,
      level: 1,
      damage: 1,
      speed: 1,
      name: 'Starter Pet',
      position: { x: 100, y: 100 }
    }],
    inventory: [],
    clans: [],
    playerClan: null,
    enchants: [],
    playTime: 0,
    gameHistory: [],
    created: new Date().toISOString(),
    lastSaved: new Date().toISOString()
  };
  
  const games = readJSON('games.json');
  games[playerId] = newGame;
  writeJSON('games.json', games);
  
  return newGame;
}

// Uruchom serwer
app.listen(PORT, () => {
  console.log(`Pet Simulator 99 2.0 backend running on port ${PORT}`);
  console.log(`WebSocket server running on port 8080`);

});
