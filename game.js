// Konfiguracja
const API_BASE = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:8080';

// Game state
const gameState = {
    playerId: null,
    playerName: 'Gracz',
    money: 0,
    totalMoney: 0,
    breakablesDestroyed: 0,
    keys: 0,
    gifts: 0,
    pets: [],
    inventory: [],
    clans: [],
    playerClan: null,
    enchants: [],
    playTime: 0,
    gameHistory: [],
    connected: false,
    ws: null
};

// Item types
const itemTypes = {
    POTION: { name: "Mikstura", rarity: "common", effect: "Tymczasowy boost" },
    ENCHANT: { name: "Zaklęcie", rarity: "rare", effect: "Stałe wzmocnienie" },
    KEY: { name: "Klucz", rarity: "rare", effect: "Otwiera Ultra-Loot Chest" },
    GIFT: { name: "Prezent", rarity: "rare", effect: "Zawiera losowe przedmioty" },
    ULTRA_RARE: { name: "Rzadki Przedmiot", rarity: "ultra-rare", effect: "Można handlować" }
};

// Breakable types
const breakableTypes = [
    { name: "Zwykły", value: 1, color: "#8bc34a", spawnRate: 0.7 },
    { name: "Rzadki", value: 5, color: "#2196f3", spawnRate: 0.2 },
    { name: "Epicki", value: 20, color: "#9c27b0", spawnRate: 0.07 },
    { name: "Legendarny", value: 100, color: "#ff9800", spawnRate: 0.03 }
];

// Inicjalizacja gry
async function initGame() {
    await loadPlayerInfo();
    await loadGameState();
    connectWebSocket();
    startGameLoop();
    startAutoSave();
    
    setupEventListeners();
    renderAll();
}

// Ładowanie informacji o graczu
async function loadPlayerInfo() {
    let playerId = localStorage.getItem('playerId');
    let playerName = localStorage.getItem('playerName');
    
    if (!playerId) {
        playerId = 'player_' + Date.now();
        playerName = prompt('Podaj swoją nazwę gracza:', 'Gracz') || 'Gracz';
        
        localStorage.setItem('playerId', playerId);
        localStorage.setItem('playerName', playerName);
    }
    
    gameState.playerId = playerId;
    gameState.playerName = playerName;
    document.getElementById('player-name').textContent = playerName;
}

// Ładowanie stanu gry z backendu
async function loadGameState() {
    try {
        const response = await fetch(`${API_BASE}/game/${gameState.playerId}`);
        if (response.ok) {
            const data = await response.json();
            Object.assign(gameState, data);
            showNotification('Stan gry załadowany z serwera!');
        } else {
            showNotification('Tworzenie nowej gry...');
        }
    } catch (error) {
        console.error('Error loading game:', error);
        showNotification('Błąd ładowania gry, używam lokalnego zapisu');
        loadLocalGameState();
    }
    
    updateStats();
}

// Ładowanie lokalnego stanu gry
function loadLocalGameState() {
    const savedState = localStorage.getItem('petSimulator99');
    if (savedState) {
        const parsedState = JSON.parse(savedState);
        Object.assign(gameState, parsedState);
    }
}

// Zapisywanie stanu gry
async function saveGameState() {
    try {
        const response = await fetch(`${API_BASE}/game/${gameState.playerId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(gameState)
        });
        
        if (response.ok) {
            console.log('Game state saved to backend');
        }
    } catch (error) {
        console.error('Error saving game:', error);
        localStorage.setItem('petSimulator99', JSON.stringify(gameState));
    }
}

// Połączenie WebSocket
function connectWebSocket() {
    try {
        gameState.ws = new WebSocket(WS_URL);
        
        gameState.ws.onopen = () => {
            gameState.connected = true;
            updateConnectionStatus();
            showNotification('Połączono z serwerem!');
        };
        
        gameState.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };
        
        gameState.ws.onclose = () => {
            gameState.connected = false;
            updateConnectionStatus();
            showNotification('Rozłączono z serwerem, próba ponownego połączenia...');
            setTimeout(connectWebSocket, 5000);
        };
        
        gameState.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            gameState.connected = false;
            updateConnectionStatus();
        };
        
    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        gameState.connected = false;
        updateConnectionStatus();
    }
}

// Obsługa wiadomości WebSocket
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'NEW_TRADE':
            showNotification(`Nowa oferta handlowa: ${data.payload.playerName}`);
            loadTrades();
            break;
        case 'TRADE_UPDATE':
            showNotification('Aktualizacja handlu');
            loadTrades();
            break;
        case 'CLAN_CHAT':
            addChatMessage(data.payload, 'clan');
            break;
        case 'GLOBAL_CHAT':
            addChatMessage(data.payload, 'global');
            break;
    }
}

// Aktualizacja statusu połączenia
function updateConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = gameState.connected ? 'Online' : 'Offline';
        statusElement.className = gameState.connected ? 'connected' : 'disconnected';
    }
}

// Wysyłanie wiadomości czatu
function sendChatMessage(message, type = 'global') {
    if (!gameState.connected) {
        showNotification('Nie jesteś połączony z serwerem');
        return;
    }
    
    const chatData = {
        type: type === 'clan' ? 'CLAN_MESSAGE' : 'GLOBAL_MESSAGE',
        payload: {
            playerId: gameState.playerId,
            playerName: gameState.playerName,
            message: message,
            timestamp: new Date().toISOString(),
            clanId: gameState.playerClan
        }
    };
    
    gameState.ws.send(JSON.stringify(chatData));
    addChatMessage(chatData.payload, type);
}

// Dodawanie wiadomości do czatu
function addChatMessage(messageData, type) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${type}`;
    
    const time = new Date(messageData.timestamp).toLocaleTimeString();
    messageElement.innerHTML = `
        <strong>${messageData.playerName}:</strong> ${messageData.message}
        <small style="float: right;">${time}</small>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Ładowanie ofert handlowych
async function loadTrades() {
    try {
        const response = await fetch(`${API_BASE}/trades`);
        if (response.ok) {
            const trades = await response.json();
            renderTrades(trades);
        }
    } catch (error) {
        console.error('Error loading trades:', error);
    }
}

// Renderowanie ofert handlowych
function renderTrades(trades) {
    const tradesList = document.getElementById('trades-list');
    if (!tradesList) return;
    
    tradesList.innerHTML = '';
    
    trades.filter(trade => trade.status === 'active').forEach(trade => {
        const tradeElement = document.createElement('div');
        tradeElement.className = 'trade-item';
        tradeElement.innerHTML = `
            <div>
                <strong>${trade.playerName}</strong>
                <div>Oferuje: ${trade.offerItems ? trade.offerItems.length : 0} przedmiotów + 💰${trade.offerMoney || 0}</div>
                <div>Żąda: ${trade.requestItems ? trade.requestItems.length : 0} przedmiotów + 💰${trade.requestMoney || 0}</div>
            </div>
            <button onclick="acceptTrade('${trade.id}')">Akceptuj</button>
        `;
        tradesList.appendChild(tradeElement);
    });
}

// Funkcja showNotification
function showNotification(message) {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Setup event listeners
function setupEventListeners() {
    // Buy pet button
    const buyPetBtn = document.getElementById('buy-pet');
    if (buyPetBtn) {
        buyPetBtn.addEventListener('click', buyPet);
    }
    
    // Trade modal
    const openTradeBtn = document.getElementById('open-trade');
    if (openTradeBtn) {
        openTradeBtn.addEventListener('click', openTradeModal);
    }
    
    // Clan buttons
    const createClanBtn = document.getElementById('create-clan');
    if (createClanBtn) {
        createClanBtn.addEventListener('click', openClanModal);
    }
    
    const joinClanBtn = document.getElementById('join-clan');
    if (joinClanBtn) {
        joinClanBtn.addEventListener('click', openJoinClanModal);
    }
    
    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', closeModals);
    });
    
    // Clan creation
    const confirmClanBtn = document.getElementById('confirm-clan');
    if (confirmClanBtn) {
        confirmClanBtn.addEventListener('click', createClan);
    }
    
    // Chat
    const sendChatBtn = document.getElementById('send-chat');
    const chatInput = document.getElementById('chat-input');
    
    if (sendChatBtn && chatInput) {
        sendChatBtn.addEventListener('click', () => {
            if (chatInput.value.trim()) {
                sendChatMessage(chatInput.value.trim());
                chatInput.value = '';
            }
        });
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && chatInput.value.trim()) {
                sendChatMessage(chatInput.value.trim());
                chatInput.value = '';
            }
        });
    }
}

// Render all game elements
function renderAll() {
    renderPets();
    renderInventory();
    renderClans();
    updateStats();
}

// Game loop
function startGameLoop() {
    // Spawn breakables
    setInterval(() => {
        spawnBreakable();
    }, 2000);
    
    // Update play time
    setInterval(() => {
        gameState.playTime++;
        updateStats();
    }, 1000);
    
    // Pet working loop
    setInterval(() => {
        gameState.pets.forEach(pet => {
            if (Math.random() < 0.3) {
                pet.working = true;
                setTimeout(() => {
                    pet.working = false;
                    const breakables = document.querySelectorAll('.breakable');
                    if (breakables.length > 0) {
                        const randomBreakable = breakables[Math.floor(Math.random() * breakables.length)];
                        destroyBreakable(randomBreakable, pet);
                    }
                }, 1000);
            }
        });
    }, 3000);
}

// Spawn breakable
function spawnBreakable() {
    const gameArea = document.getElementById('game-area');
    if (!gameArea) return;
    
    const breakableType = getRandomBreakableType();
    
    const breakable = document.createElement('div');
    breakable.className = 'breakable';
    breakable.style.backgroundColor = breakableType.color;
    breakable.style.left = `${Math.random() * (gameArea.offsetWidth - 50)}px`;
    breakable.style.top = `${Math.random() * (gameArea.offsetHeight - 50)}px`;
    breakable.textContent = '💎';
    breakable.dataset.value = breakableType.value;
    breakable.dataset.type = breakableType.name;
    
    breakable.addEventListener('click', () => {
        destroyBreakable(breakable, { damage: 1 });
    });
    
    gameArea.appendChild(breakable);
    
    setTimeout(() => {
        if (breakable.parentNode) {
            breakable.parentNode.removeChild(breakable);
        }
    }, 30000);
}

// Get random breakable type
function getRandomBreakableType() {
    const rand = Math.random();
    let cumulative = 0;
    
    for (const type of breakableTypes) {
        cumulative += type.spawnRate;
        if (rand <= cumulative) {
            return type;
        }
    }
    
    return breakableTypes[0];
}

// Destroy breakable
function destroyBreakable(breakableElement, pet) {
    const value = parseInt(breakableElement.dataset.value);
    const type = breakableElement.dataset.type;
    
    // Add money
    gameState.money += value;
    gameState.totalMoney += value;
    gameState.breakablesDestroyed++;
    
    // Chance to drop item
    if (Math.random() < 0.1) {
        const item = getRandomItem();
        gameState.inventory.push(item);
        showNotification(`Zdobyto: ${item.name} (${item.rarity})!`);
        renderInventory();
    }
    
    // Update UI
    updateStats();
    
    // Animation
    breakableElement.style.transform = 'scale(1.5)';
    breakableElement.style.opacity = '0.5';
    
    setTimeout(() => {
        if (breakableElement.parentNode) {
            breakableElement.parentNode.removeChild(breakableElement);
        }
    }, 300);
    
    // Add to game history
    gameState.gameHistory.push({
        type: 'breakable_destroyed',
        timestamp: new Date().toISOString(),
        breakableType: type,
        value: value,
        petId: pet.id || 'player'
    });
}

// Get random item
function getRandomItem() {
    const rand = Math.random();
    let item;
    
    if (rand < 0.5) {
        item = { ...itemTypes.POTION, id: Date.now() };
    } else if (rand < 0.75) {
        item = { ...itemTypes.ENCHANT, id: Date.now() };
    } else if (rand < 0.9) {
        item = { ...itemTypes.KEY, id: Date.now() };
        gameState.keys++;
    } else if (rand < 0.98) {
        item = { ...itemTypes.GIFT, id: Date.now() };
        gameState.gifts++;
    } else {
        item = { ...itemTypes.ULTRA_RARE, id: Date.now(), name: getUltraRareItemName() };
    }
    
    return item;
}

// Get ultra rare item name
function getUltraRareItemName() {
    const names = [
        "Mityczny Miecz",
        "Starożytny Artefakt",
        "Kryształ Mocy",
        "Smocza Skóra",
        "Klejnot Wieczności"
    ];
    return names[Math.floor(Math.random() * names.length)];
}

// Buy pet
function buyPet() {
    if (gameState.money >= 100) {
        gameState.money -= 100;
        
        const newPet = {
            id: Date.now(),
            level: 1,
            damage: 1,
            speed: 1,
            position: {
                x: Math.random() * (document.getElementById('game-area').offsetWidth - 40),
                y: Math.random() * (document.getElementById('game-area').offsetHeight - 40)
            }
        };
        
        gameState.pets.push(newPet);
        renderPets();
        updateStats();
        saveGameState();
        
        showNotification("Kupiłeś nowe zwierzę!");
    } else {
        showNotification("Nie masz wystarczająco pieniędzy!");
    }
}

// Render pets
function renderPets() {
    const petsList = document.getElementById('pets-list');
    const gameArea = document.getElementById('game-area');
    
    if (!petsList || !gameArea) return;
    
    petsList.innerHTML = '';
    
    // Clear existing pet visuals
    document.querySelectorAll('.pet').forEach(pet => pet.remove());
    
    gameState.pets.forEach(pet => {
        const petElement = document.createElement('div');
        petElement.className = 'inventory-item';
        petElement.innerHTML = `
            <div class="item-icon" style="background-color: var(--pet-color)">🐾</div>
            <div>
                <div>Zwierzę #${pet.id}</div>
                <div>Poziom: ${pet.level} | Obrażenia: ${pet.damage}</div>
            </div>
        `;
        petsList.appendChild(petElement);
        
        // Add pet to game area
        const petVisual = document.createElement('div');
        petVisual.className = `pet ${pet.working ? 'working' : ''}`;
        petVisual.style.left = `${pet.position.x}px`;
        petVisual.style.top = `${pet.position.y}px`;
        petVisual.textContent = '🐾';
        gameArea.appendChild(petVisual);
    });
}

// Render inventory
function renderInventory() {
    const inventory = document.getElementById('inventory');
    if (!inventory) return;
    
    inventory.innerHTML = '';
    
    if (gameState.inventory.length === 0) {
        inventory.innerHTML = '<p>Twój ekwipunek jest pusty</p>';
        return;
    }
    
    gameState.inventory.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'inventory-item';
        itemElement.innerHTML = `
            <div class="item-icon ${item.rarity === 'common' ? 'item-common' : item.rarity === 'rare' ? 'item-rare' : 'item-ultra-rare'}">
                ${item.name === 'Mikstura' ? '🧪' : 
                  item.name === 'Zaklęcie' ? '✨' : 
                  item.name === 'Klucz' ? '🔑' : 
                  item.name === 'Prezent' ? '🎁' : '💎'}
            </div>
            <div>
                <div>${item.name}</div>
                <div>${item.effect}</div>
            </div>
        `;
        
        itemElement.addEventListener('click', () => useItem(item));
        inventory.appendChild(itemElement);
    });
}

// Use item
function useItem(item) {
    if (item.name === 'Mikstura') {
        showNotification("Użyto mikstury! Otrzymujesz tymczasowy boost!");
    } else if (item.name === 'Zaklęcie') {
        if (gameState.enchants.length < 5) {
            gameState.enchants.push(item);
            showNotification("Użyto zaklęcia! Otrzymujesz stałe wzmocnienie!");
        } else {
            showNotification("Masz już maksymalną liczbę zaklęć (5)!");
            return;
        }
    } else if (item.name === 'Klucz') {
        if (gameState.keys > 0) {
            gameState.keys--;
            openUltraLootChest();
        }
    } else if (item.name === 'Prezent') {
        if (gameState.gifts > 0) {
            gameState.gifts--;
            openGift();
        }
    } else {
        showNotification(`To jest rzadki przedmiot: ${item.name}. Możesz go użyć w handlu!`);
    }
    
    gameState.inventory = gameState.inventory.filter(i => i.id !== item.id);
    renderInventory();
    updateStats();
    saveGameState();
}

// Open ultra loot chest
function openUltraLootChest() {
    const rewards = [];
    for (let i = 0; i < 3; i++) {
        rewards.push(getRandomItem());
    }
    
    gameState.inventory.push(...rewards);
    renderInventory();
    showNotification("Otworzyłeś Ultra-Loot Chest! Zdobyłeś 3 losowe przedmioty!");
}

// Open gift
function openGift() {
    const moneyReward = Math.floor(Math.random() * 50) + 10;
    gameState.money += moneyReward;
    
    const itemCount = Math.floor(Math.random() * 3) + 1;
    const items = [];
    for (let i = 0; i < itemCount; i++) {
        items.push(getRandomItem());
    }
    
    gameState.inventory.push(...items);
    renderInventory();
    updateStats();
    showNotification(`Otworzyłeś prezent! Zdobyłeś ${moneyReward} pieniędzy i ${itemCount} przedmiotów!`);
}

// Render clans
async function renderClans() {
    const clanList = document.getElementById('clan-list');
    if (!clanList) return;
    
    try {
        const response = await fetch(`${API_BASE}/clans`);
        if (response.ok) {
            const clans = await response.json();
            gameState.clans = clans;
            
            clanList.innerHTML = '';
            
            if (clans.length === 0) {
                clanList.innerHTML = '<p>Brak dostępnych klanów</p>';
                return;
            }
            
            clans.forEach(clan => {
                const clanElement = document.createElement('div');
                clanElement.className = 'clan-item';
                clanElement.innerHTML = `
                    <h4>${clan.name}</h4>
                    <p>Członków: ${clan.members.length}</p>
                    <p>Poziom: ${clan.level}</p>
                `;
                
                if (!gameState.playerClan) {
                    const joinButton = document.createElement('button');
                    joinButton.textContent = 'Dołącz';
                    joinButton.addEventListener('click', () => joinClan(clan.id));
                    clanElement.appendChild(joinButton);
                }
                
                clanList.appendChild(clanElement);
            });
        }
    } catch (error) {
        console.error('Error loading clans:', error);
        clanList.innerHTML = '<p>Błąd ładowania klanów</p>';
    }
}

// Open clan modal
function openClanModal() {
    document.getElementById('clan-modal-title').textContent = 'Stwórz Klan';
    document.getElementById('clan-modal').style.display = 'flex';
}

// Open join clan modal
function openJoinClanModal() {
    document.getElementById('clan-modal-title').textContent = 'Dołącz do Klanu';
    document.getElementById('clan-modal').style.display = 'flex';
}

// Create clan
async function createClan() {
    const clanName = document.getElementById('clan-name').value.trim();
    
    if (!clanName) {
        showNotification("Nazwa klanu nie może być pusta!");
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/clans`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: clanName,
                playerId: gameState.playerId,
                playerName: gameState.playerName
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            gameState.playerClan = result.clan.id;
            closeModals();
            showNotification(`Stworzyłeś klan: ${clanName}!`);
            renderClans();
            saveGameState();
        }
    } catch (error) {
        console.error('Error creating clan:', error);
        showNotification('Błąd tworzenia klanu');
    }
}

// Join clan
async function joinClan(clanId) {
    try {
        const response = await fetch(`${API_BASE}/clans/${clanId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                playerId: gameState.playerId,
                playerName: gameState.playerName
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            gameState.playerClan = clanId;
            showNotification(`Dołączyłeś do klanu: ${result.clan.name}!`);
            renderClans();
            saveGameState();
        }
    } catch (error) {
        console.error('Error joining clan:', error);
        showNotification('Błąd dołączania do klanu');
    }
}

// Open trade modal
function openTradeModal() {
    document.getElementById('trade-modal').style.display = 'flex';
    loadTrades();
}

// Close all modals
function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// Accept trade (placeholder)
function acceptTrade(tradeId) {
    showNotification('Funkcja akceptowania handlu w budowie!');
}

// Update stats
function updateStats() {
    const moneyElement = document.getElementById('money');
    const keysElement = document.getElementById('keys');
    const giftsElement = document.getElementById('gifts');
    const breakablesElement = document.getElementById('breakables-destroyed');
    const totalMoneyElement = document.getElementById('total-money');
    const playTimeElement = document.getElementById('play-time');
    
    if (moneyElement) moneyElement.textContent = gameState.money;
    if (keysElement) keysElement.textContent = gameState.keys;
    if (giftsElement) giftsElement.textContent = gameState.gifts;
    if (breakablesElement) breakablesElement.textContent = gameState.breakablesDestroyed;
    if (totalMoneyElement) totalMoneyElement.textContent = gameState.totalMoney;
    
    if (playTimeElement) {
        const hours = Math.floor(gameState.playTime / 3600);
        const minutes = Math.floor((gameState.playTime % 3600) / 60);
        const seconds = gameState.playTime % 60;
        playTimeElement.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Auto save
function startAutoSave() {
    setInterval(() => {
        saveGameState();
    }, 30000);
}

// Uruchomienie gry
window.addEventListener('load', initGame);