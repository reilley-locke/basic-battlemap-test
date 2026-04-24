const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle Movement
    socket.on('tokenMove', (data) => {
        socket.broadcast.emit('tokenUpdate', data);
    });

    // Handle New Tokens
    socket.on('newToken', (data) => {
        socket.broadcast.emit('addRemoteToken', data);
    });

    // Sync Cell Size
    socket.on('updateCellSize', (size) => {
        socket.broadcast.emit('remoteCellSize', size);
    });

    // Sync Background Scale
    socket.on('updateBgScale', (scale) => {
        socket.broadcast.emit('remoteBgScale', scale);
    });

    // Sync Background Image
    socket.on('updateBgImage', (imageData) => {
        socket.broadcast.emit('remoteBgImage', imageData);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));