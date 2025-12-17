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

function getOrCreateRoom(room) {
  if (!rooms.has(room)) {
    rooms.set(room, {
      hostId: null,
      members: new Map(),
      pending: new Set()
    });
  }

  return rooms.get(room);
}

function getApprovedMembers(state) {
  return Array.from(state.members.values()).filter(member => member.approved);
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
  const approvedMembers = getApprovedMembers(state);
  if (approvedMembers.length >= 2) {
    approvedMembers.forEach(member => {
      io.to(member.id).emit('ready');
    });
  }
}

function requestApproval(room, participant) {
  const state = rooms.get(room);
  if (!state) {
    return;
  }

  state.pending.add(participant.id);
  io.to(participant.id).emit('waiting-approval');

  const hostId = state.hostId;
  const hostSocket = hostId ? io.sockets.sockets.get(hostId) : null;

  if (!hostSocket) {
    return;
  }

  io.to(hostId).emit('join-request', { id: participant.id, name: participant.name });
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

function notifyHostOfPending(room) {
  const state = rooms.get(room);
  if (!state?.hostId) {
    return;
  }

  const hostSocket = io.sockets.sockets.get(state.hostId);
  if (!hostSocket) {
    return;
  }

  state.pending.forEach(id => {
    const participant = state.members.get(id);
    if (participant) {
      io.to(state.hostId).emit('join-request', { id: participant.id, name: participant.name });
    } else {
      state.pending.delete(id);
    }
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
      io.to(next.id).emit('join-approved');
    }
  }

  if (next) {
    state.pending.delete(next.id);
  }

  state.hostId = next ? next.id : null;

  if (state.hostId) {
    broadcastHostStatus(room);
    io.to(state.hostId).emit('promoted-host');
    notifyHostOfPending(room);
  } else {
    broadcastHostStatus(room);
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

  const state = getOrCreateRoom(room);
  const member = { id: socket.id, name, approved: false };
  state.members.set(socket.id, member);

  if (wantsHostRole) {
    state.hostId = socket.id;
    broadcastHostStatus(room);
  }

  const isCurrentHost = state.hostId === socket.id;

  if (isCurrentHost) {
    member.approved = true;
    socket.emit('host', { isHost: true });
    socket.emit('join-approved');
    notifyHostOfPending(room);
  } else {
    socket.emit('host', { isHost: false });
    requestApproval(room, member);
  }

  const isInitiator = member.approved && getApprovedMembers(state).length === 1;
  socket.emit('init', { isInitiator });

  emitParticipants(room);

  socket.on('approve-join', payload => {
    if (state.hostId !== socket.id) {
      return;
    }

    const targetId = typeof payload === 'string' ? payload : payload?.id;
    if (!targetId) {
      return;
    }

    const target = state.members.get(targetId);
    if (!target || target.approved) {
      return;
    }

    target.approved = true;
    state.pending.delete(targetId);
    io.to(targetId).emit('join-approved');
    io.to(state.hostId).emit('join-request-resolved', { id: targetId });
    emitParticipants(room);
    emitReadyIfPossible(room);
  });

  socket.on('offer', payload => {
    if (!state.members.get(socket.id)?.approved) {
      return;
    }
    socket.to(room).emit('offer', payload);
  });

  socket.on('answer', payload => {
    if (!state.members.get(socket.id)?.approved) {
      return;
    }
    socket.to(room).emit('answer', payload);
  });

  socket.on('ice-candidate', candidate => {
    if (!state.members.get(socket.id)?.approved) {
      return;
    }
    socket.to(room).emit('ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    socket.to(room).emit('peer-left');
    const currentState = rooms.get(room);
    if (!currentState) {
      return;
    }

    const member = currentState.members.get(socket.id);
    const wasHost = currentState.hostId === socket.id;
    const wasApproved = member?.approved;
    currentState.pending.delete(socket.id);
    currentState.members.delete(socket.id);

    if (!currentState.members.size) {
      rooms.delete(room);
      return;
    }

    if (!wasApproved && currentState.hostId && currentState.hostId !== socket.id) {
      io.to(currentState.hostId).emit('join-request-resolved', { id: socket.id });
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
  console.log(`Signaling server listening on :${PORT}`);
});
