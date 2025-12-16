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

const participants = new Map();

function emitParticipants(room) {
  const roomMap = participants.get(room);
  const payload = roomMap ? Array.from(roomMap.values()) : [];
  io.to(room).emit('participants', payload);
}

io.on('connection', socket => {
  const room = socket.handshake.query.room;
  const name = (socket.handshake.query.name || '').toString().trim().slice(0, 60) || 'Guest';

  if (!room) {
    socket.emit('error', { message: 'Room missing' });
    socket.disconnect();
    return;
  }

  socket.join(room);

  if (!participants.has(room)) {
    participants.set(room, new Map());
  }
  const roomMap = participants.get(room);
  roomMap.set(socket.id, { id: socket.id, name });

  const isInitiator = roomMap.size === 1;
  socket.emit('init', { isInitiator });

  emitParticipants(room);

  if (roomMap.size > 1) {
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
    const roomMap = participants.get(room);
    if (roomMap) {
      roomMap.delete(socket.id);
      if (!roomMap.size) {
        participants.delete(room);
      }
    }
    emitParticipants(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server listening on :${PORT}`);
});
