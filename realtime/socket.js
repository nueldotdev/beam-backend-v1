const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getMeetingState, removeParticipant } = require('./meetingState');

function parseBearer(tokenOrHeader) {
  if (!tokenOrHeader) return null;
  const s = String(tokenOrHeader);
  if (s.startsWith('Bearer ')) return s.slice('Bearer '.length);
  return s;
}

function createSocketServer(httpServer, { corsOrigins }) {
  const allowAnyOrigin = Array.isArray(corsOrigins) && corsOrigins.includes('*');
  const io = new Server(httpServer, {
    cors: {
      origin: allowAnyOrigin ? true : corsOrigins,
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    try {
      const token =
        parseBearer(socket.handshake.auth?.token) ||
        parseBearer(socket.handshake.headers?.authorization) ||
        socket.handshake.query?.token;

      if (!token) {
        socket.user = null;
        return next();
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { ...payload, _id: payload._id || payload.id };
      return next();
    } catch (e) {
      socket.user = null;
      return next();
    }
  });

  io.on('connection', (socket) => {
    let joinedMeetingKey = null;

    socket.on('meeting:join', (payload, ack) => {
      try {
        const meetingKey = String(payload?.meetingKey || '').trim();
        if (!meetingKey) throw new Error('meetingKey required');

        const displayName = String(payload?.displayName || 'Guest').slice(0, 80);
        const role = payload?.role === 'host' ? 'host' : 'participant';

        joinedMeetingKey = meetingKey;
        socket.join(meetingKey);

        const state = getMeetingState(meetingKey);
        state.participants.set(socket.id, {
          userId: socket.user?._id || null,
          displayName,
          role,
          followHost: role !== 'host',
          browse: { url: null, docId: null, page: 1 },
        });

        const roster = Array.from(state.participants.entries()).map(([socketId, p]) => ({
          socketId,
          userId: p.userId,
          displayName: p.displayName,
          role: p.role,
          followHost: p.followHost,
          browse: p.browse,
        }));

        socket.to(meetingKey).emit('meeting:participant_joined', {
          socketId: socket.id,
          userId: socket.user?._id || null,
          displayName,
          role,
        });

        ack?.({ ok: true, meetingKey, present: state.present, roster });
      } catch (e) {
        ack?.({ ok: false, error: e.message || 'join failed' });
      }
    });

    socket.on('meeting:set_follow_host', (payload) => {
      if (!joinedMeetingKey) return;
      const state = getMeetingState(joinedMeetingKey);
      const p = state.participants.get(socket.id);
      if (!p) return;
      p.followHost = !!payload?.followHost;
      socket.emit('meeting:follow_host_updated', { followHost: p.followHost, present: state.present });
    });

    // participant browsing state (independent)
    socket.on('browse:update', (payload) => {
      if (!joinedMeetingKey) return;
      const state = getMeetingState(joinedMeetingKey);
      const p = state.participants.get(socket.id);
      if (!p) return;

      p.browse = {
        url: payload?.url ?? p.browse.url ?? null,
        docId: payload?.docId ?? p.browse.docId ?? null,
        page: Number.isFinite(payload?.page) ? payload.page : p.browse.page ?? 1,
      };

      // For privacy, only broadcast if explicitly requested (host asking for "where is everyone?")
      if (payload?.broadcast === true && p.role === 'host') {
        io.to(joinedMeetingKey).emit('browse:host_broadcast', { present: state.present });
      }
    });

    // host presentation state (what host is "showing")
    socket.on('present:update', (payload) => {
      if (!joinedMeetingKey) return;
      const state = getMeetingState(joinedMeetingKey);
      const p = state.participants.get(socket.id);
      if (!p || p.role !== 'host') return;

      state.present = {
        docId: payload?.docId ?? state.present.docId ?? null,
        page: Number.isFinite(payload?.page) ? payload.page : state.present.page ?? 1,
        url: payload?.url ?? state.present.url ?? null,
      };

      // Everyone gets the host's "present" state; participants may choose to follow or not client-side.
      io.to(joinedMeetingKey).emit('present:updated', { present: state.present });
    });

    // lightweight meeting chat (persisted elsewhere via REST later)
    socket.on('chat:send', (payload, ack) => {
      if (!joinedMeetingKey) return ack?.({ ok: false, error: 'not in meeting' });
      const state = getMeetingState(joinedMeetingKey);
      const p = state.participants.get(socket.id);
      if (!p) return ack?.({ ok: false, error: 'unknown participant' });

      const msg = {
        id: `${Date.now()}-${socket.id}`,
        meetingKey: joinedMeetingKey,
        from: { socketId: socket.id, userId: p.userId, displayName: p.displayName, role: p.role },
        content: String(payload?.content || '').slice(0, 4000),
        ts: Date.now(),
      };
      io.to(joinedMeetingKey).emit('chat:message', msg);
      ack?.({ ok: true, message: msg });
    });

    socket.on('transcript:chunk', (payload) => {
      if (!joinedMeetingKey) return;
      const state = getMeetingState(joinedMeetingKey);
      const p = state.participants.get(socket.id);
      if (!p) return;

      io.to(joinedMeetingKey).emit('transcript:chunk', {
        meetingKey: joinedMeetingKey,
        speaker: { socketId: socket.id, userId: p.userId, displayName: p.displayName },
        content: String(payload?.content || '').slice(0, 8000),
        isFinal: !!payload?.isFinal,
        ts: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      if (!joinedMeetingKey) return;
      const state = getMeetingState(joinedMeetingKey);
      removeParticipant(joinedMeetingKey, socket.id);
      socket.to(joinedMeetingKey).emit('meeting:participant_left', { socketId: socket.id });

      // If meeting still exists, emit updated roster
      const remaining = state?.participants ? Array.from(state.participants.entries()).map(([socketId, p]) => ({
        socketId,
        userId: p.userId,
        displayName: p.displayName,
        role: p.role,
        followHost: p.followHost,
        browse: p.browse,
      })) : [];
      if (state) {
        io.to(joinedMeetingKey).emit('meeting:roster', { roster: remaining });
      }
    });
  });

  return io;
}

module.exports = { createSocketServer };

