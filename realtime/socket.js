const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getMeetingState, removeParticipant } = require('./meetingState');
const Transcript = require('../models/Transcript');
const { resolveMeetingByKey } = require('../utils/resolveMeeting');

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
        const meetingKey = String(payload?.meetingKey || '').trim().toUpperCase();
        if (!meetingKey) throw new Error('meetingKey required');

        console.log(`[Socket] Socket ${socket.id} joining room: ${meetingKey}`);
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

        console.log(`[Socket] Room ${meetingKey} roster:`, roster.map(p => p.displayName));

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

      // If payload is explicitly null, stop the presentation for everyone
      if (payload === null || payload.url === null) {
        state.present = null;
      } else {
        state.present = {
          docId: 'docId' in payload ? payload.docId : (state.present?.docId ?? null),
          page: Number.isFinite(payload?.page) ? payload.page : (state.present?.page ?? 1),
          url: 'url' in payload ? payload.url : (state.present?.url ?? null),
          fileType: 'fileType' in payload ? payload.fileType : (state.present?.fileType ?? 'pdf'),
        };
      }

      // Everyone gets the host's "present" state; participants may choose to follow or not client-side.
      io.to(joinedMeetingKey).emit('present:updated', { present: state.present });
    });

    // host ending the meeting for everyone
    socket.on('meeting:end', () => {
      if (!joinedMeetingKey) return;
      const state = getMeetingState(joinedMeetingKey);
      const p = state.participants.get(socket.id);
      if (!p || p.role !== 'host') return;

      io.to(joinedMeetingKey).emit('meeting:ended', {
        message: 'The host has ended the meeting.'
      });
    });

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

    socket.on('transcript:chunk', async (payload) => {
      if (!joinedMeetingKey) {
        console.warn(`[Socket] Received transcript:chunk but joinedMeetingKey is missing for socket ${socket.id}`);
        return;
      }
      const state = getMeetingState(joinedMeetingKey);
      const p = state.participants.get(socket.id);
      
      const displayName = p?.displayName || payload?.displayName || "Unknown Speaker";
      const userId = p?.userId || socket.id;

      const chunk = {
        meetingKey: joinedMeetingKey,
        speaker: { socketId: socket.id, userId, displayName },
        content: String(payload?.content || '').slice(0, 8000),
        isFinal: !!payload?.isFinal,
        ts: Date.now(),
      };

      console.log(`[Socket] Transcript chunk from ${displayName} (${socket.id}): "${chunk.content}" (Final: ${chunk.isFinal})`);
      console.log(`[Socket] Room ${joinedMeetingKey} has ${state.participants.size} participants. Broadcasting...`);

      // Broadcast to all participants for real-time captions
      io.to(joinedMeetingKey).emit('transcript:chunk', chunk);

      // Persist to DB if it's a final chunk
      if (chunk.isFinal && chunk.content.trim()) {
        try {
          const meeting = await resolveMeetingByKey(joinedMeetingKey);
          if (meeting) {
            await Transcript.create({
              meetingId: meeting._id,
              speakerId: userId,
              speakerName: displayName,
              content: chunk.content,
              isFinal: true,
              timestamp: new Date(chunk.ts),
            });
          }
        } catch (err) {
          console.error("Failed to persist transcript chunk:", err);
        }
      }
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

