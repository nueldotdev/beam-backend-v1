const meetingStates = new Map();

function getMeetingState(meetingKey) {
  if (!meetingStates.has(meetingKey)) {
    meetingStates.set(meetingKey, {
      // host "presentation" state (what the host is showing)
      present: {
        docId: null,
        page: 1,
        url: null,
      },
      // per-socket browsing state (participants can diverge from host)
      participants: new Map(), // socketId -> { userId, displayName, role, followHost, browse: { url, docId, page } }
    });
  }
  return meetingStates.get(meetingKey);
}

function removeParticipant(meetingKey, socketId) {
  const state = meetingStates.get(meetingKey);
  if (!state) return;
  state.participants.delete(socketId);
  if (state.participants.size === 0) {
    meetingStates.delete(meetingKey);
  }
}

module.exports = { getMeetingState, removeParticipant };

