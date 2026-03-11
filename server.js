const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname)); // Serves your index.html/script.js

io.on('connection', (socket) => {
    // When a player moves a token, broadcast that move to everyone else
    socket.on('tokenMove', (data) => {
        socket.broadcast.emit('tokenUpdate', data);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));