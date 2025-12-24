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

const rooms = new Map();

function logRoom(room, message, detail) {
  const prefix = room ? `[room:${room}]` : '[room:global]';
  if (typeof detail !== 'undefined') {
    console.log(prefix, message, detail);
  } else {
    console.log(prefix, message);
  }
}

function getOrCreateRoom(room) {
  if (!rooms.has(room)) {
    rooms.set(room, {
      hostId: null,
      members: new Map(),
      hasActiveCall: false,
      readyInterval: null
    });
  }

  return rooms.get(room);
}

function getApprovedMembers(state) {
  return Array.from(state.members.values()).filter(member => member.approved);
}

function getReadyMembers(state) {
  return Array.from(state.members.values()).filter(member => member.approved && member.ready);
}

function emitParticipants(room) {
  const state = rooms.get(room);
  if (!state) {
    return;
  }

  const approvedCount = getApprovedMembers(state).length;
  io.to(room).emit('participants', { count: approvedCount });
}

function emitReadyIfPossible(room) {
  const state = rooms.get(room);
  if (!state) {
    return;
  }
  const readyMembers = getReadyMembers(state);
  if (readyMembers.length >= 2 && !state.hasActiveCall) {
    readyMembers.forEach(member => {
      io.to(member.id).emit('ready');
    });
    logRoom(room, `ready signal sent to ${readyMembers.length} participant(s)`);
    ensureReadyInterval(room);
    return;
  }

  if (readyMembers.length < 2) {
    state.hasActiveCall = false;
  }
  clearReadyInterval(state);
}

function ensureReadyInterval(room) {
  const state = rooms.get(room);
  if (!state || state.readyInterval || state.hasActiveCall) {
    return;
  }

  state.readyInterval = setInterval(() => {
    const currentState = rooms.get(room);
    if (!currentState || currentState.hasActiveCall) {
      clearReadyInterval(currentState);
      return;
    }
    const readyMembers = getReadyMembers(currentState);
    if (readyMembers.length < 2) {
      if (currentState) {
        currentState.hasActiveCall = false;
      }
      clearReadyInterval(currentState);
      return;
    }
    readyMembers.forEach(member => {
      io.to(member.id).emit('ready');
    });
    logRoom(room, `repeating ready signal for ${readyMembers.length} participant(s)`);
  }, 2000);
}

function clearReadyInterval(state) {
  if (state?.readyInterval) {
    clearInterval(state.readyInterval);
    state.readyInterval = null;
  }
}

function broadcastHostStatus(room) {
  const state = rooms.get(room);
  if (!state) {
    return;
  }

  state.members.forEach(member => {
    io.to(member.id).emit('host', { isHost: state.hostId === member.id });
  });
}

function promoteNextHost(room) {
  const state = rooms.get(room);
  if (!state) {
    return;
  }

  let next = getApprovedMembers(state)[0];

  if (!next) {
    next = state.members.values().next().value;
    if (next) {
      next.approved = true;
    }
  }

  state.hostId = next ? next.id : null;

  if (state.hostId) {
    broadcastHostStatus(room);
    io.to(state.hostId).emit('promoted-host');
    logRoom(room, `host assigned to ${state.hostId}`);
  } else {
    broadcastHostStatus(room);
    logRoom(room, 'no host available after promotion');
  }
}

io.on('connection', socket => {
  const room = socket.handshake.query.room;
  const wantsHostRole = socket.handshake.query.isHost === '1';
  const name = (socket.handshake.query.name || '').toString().trim().slice(0, 60) || 'Guest';

  if (!room) {
    socket.emit('error', { message: 'Room missing' });
    socket.disconnect();
    return;
  }

  socket.join(room);
  logRoom(room, `${socket.id} connected`, { wantsHostRole });

  const state = getOrCreateRoom(room);
  const member = { id: socket.id, name, approved: true, ready: false };
  state.members.set(socket.id, member);

  if (wantsHostRole) {
    state.hostId = socket.id;
    broadcastHostStatus(room);
  } else if (!state.hostId) {
    promoteNextHost(room);
  }

  const isCurrentHost = state.hostId === socket.id;

  socket.emit('host', { isHost: isCurrentHost });

  const isInitiator = member.approved && getApprovedMembers(state).length === 1;
  socket.emit('init', { isInitiator });

  emitParticipants(room);
  emitReadyIfPossible(room);

  socket.on('offer', payload => {
    if (!state.members.get(socket.id)?.approved) {
      return;
    }
    logRoom(room, `offer from ${socket.id}`);
    socket.to(room).emit('offer', payload);
  });

  socket.on('answer', payload => {
    if (!state.members.get(socket.id)?.approved) {
      return;
    }
    socket.to(room).emit('answer', payload);
    state.hasActiveCall = true;
    clearReadyInterval(state);
    logRoom(room, `answer from ${socket.id}`);
  });

  socket.on('ice-candidate', candidate => {
    if (!state.members.get(socket.id)?.approved) {
      return;
    }
    if (candidate) {
      logRoom(room, `ice-candidate from ${socket.id}`);
    }
    socket.to(room).emit('ice-candidate', candidate);
  });

  socket.on('call-ready', payload => {
    const currentMember = state.members.get(socket.id);
    if (!currentMember || !currentMember.approved) {
      return;
    }
    currentMember.ready = true;
    state.hasActiveCall = false;
    logRoom(room, `${socket.id} ready`, { mode: payload?.video === false ? 'audio' : 'video' });
    emitReadyIfPossible(room);
  });

  socket.on('call-ended', () => {
    const currentMember = state.members.get(socket.id);
    if (!currentMember) {
      return;
    }
    currentMember.ready = false;
    state.hasActiveCall = false;
    clearReadyInterval(state);
    logRoom(room, `${socket.id} ended call`);
    emitReadyIfPossible(room);
  });

  socket.on('disconnect', () => {
    logRoom(room, `${socket.id} disconnected`);
    socket.to(room).emit('peer-left');
    const currentState = rooms.get(room);
    if (!currentState) {
      return;
    }

    const wasHost = currentState.hostId === socket.id;
    const departing = currentState.members.get(socket.id);
    if (departing) {
      departing.ready = false;
    }
    currentState.members.delete(socket.id);
    currentState.hasActiveCall = false;
    clearReadyInterval(currentState);
    logRoom(room, `${socket.id} cleanup complete`, { remaining: currentState.members.size });

    if (!currentState.members.size) {
      clearReadyInterval(currentState);
      rooms.delete(room);
      return;
    }

    if (wasHost) {
      promoteNextHost(room);
    }

    emitParticipants(room);
    emitReadyIfPossible(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logRoom(null, `Signaling server listening on :${PORT}`);
});
