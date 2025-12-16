const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', socket => {
  const room = socket.handshake.query.room;

  if (!room) {
    socket.emit('error', { message: 'Room missing' });
    socket.disconnect();
    return;
  }

  socket.join(room);
  const roomClients = io.sockets.adapter.rooms.get(room) || new Set();
  const isInitiator = roomClients.size === 1;

  socket.emit('init', { isInitiator });

  io.to(room).emit('participants', { count: roomClients.size });

  if (roomClients.size > 1) {
    io.to(room).emit('ready');
  }

  socket.on('offer', payload => {
    socket.to(room).emit('offer', payload);
  });

  socket.on('answer', payload => {
    socket.to(room).emit('answer', payload);
  });

  socket.on('ice-candidate', candidate => {
    socket.to(room).emit('ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    socket.to(room).emit('peer-left');
    const updatedRoom = io.sockets.adapter.rooms.get(room);
    const count = updatedRoom ? updatedRoom.size : 0;
    io.to(room).emit('participants', { count });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server listening on :${PORT}`);
});
