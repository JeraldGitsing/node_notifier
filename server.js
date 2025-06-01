const express = require('express');
const http = require('http');
const socketIo = require('socket.io');


const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*"
    }
});

io.on('connection', (socket) => {
    socket.on('message', (data) => {
        console.log(data)
        io.emit('notif', data);
		data = [];
    });
});

app.get("/ourppl", (req,res) => { 
    res.send('Hello clients');
})


server.listen(5500, () => {
    console.log('Server running on port 5500');
});