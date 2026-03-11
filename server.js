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
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));