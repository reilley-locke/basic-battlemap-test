const express = require('express');
const app = express();
const http = require('http').Server(app);

// 1. INCREASE PAYLOAD LIMIT
// Default Socket.io limit is 1MB. High-res background images often exceed this.
// We've set this to 100MB (1e8 bytes).
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1e8 
});

app.use(express.static(__dirname));

// 2. SERVER-SIDE STATE (The "Librarian")
// This stores the current state of the game so that if a second player joins,
// they immediately receive the current map, scale, and tokens.
let gameState = {
    tokens: [
        { gridX: 2, gridY: 2, color: "crimson", type: "color" } // Matches your script.js default
    ],
    bgImage: null,
    bgScale: 1.0,
    cellSize: 60
};

io.on('connection', (socket) => {
    console.log('A user connected');

    // 3. INITIAL SYNC
    // Send the entire current game state to the player who just connected.
    // Note: You will need to add socket.on('initLayout', ...) to your script.js to catch this.
    socket.emit('initLayout', gameState);

    // Handle Movement
    socket.on('tokenMove', (data) => {
        // Update the server's record of where this token is
        if (gameState.tokens[data.index]) {
            gameState.tokens[data.index].gridX = data.x;
            gameState.tokens[data.index].gridY = data.y;
        }
        socket.broadcast.emit('tokenUpdate', data);
    });

    // Handle New Tokens
    socket.on('newToken', (data) => {
        gameState.tokens.push(data); // Save the new token to the server list
        socket.broadcast.emit('addRemoteToken', data);
    });

    // Sync Cell Size
    socket.on('updateCellSize', (size) => {
        gameState.cellSize = size;
        socket.broadcast.emit('remoteCellSize', size);
    });

    // Sync Background Scale
    socket.on('updateBgScale', (scale) => {
        gameState.bgScale = scale; // Remember the zoom level
        socket.broadcast.emit('remoteBgScale', scale);
    });

    // Sync Background Image
    socket.on('updateBgImage', (imageData) => {
        gameState.bgImage = imageData; // Remember the uploaded map
        socket.broadcast.emit('remoteBgImage', imageData);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));