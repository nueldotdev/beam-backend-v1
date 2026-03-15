const express = require('express');
const router = express.Router();
const { auth, optionalAuth } = require('../middleware/authMiddleware'); 
const { validate } = require('../validators/meeting.validator');
const { 
  createMeetingSchema, 
  joinMeetingSchema 
} = require('../validators/meeting.validator');
const {
  createMeeting,
  getMeeting,
  getMeetings,
  joinMeeting,
  leaveMeeting,
  updateMeeting,
  deleteMeeting,
  getMeetingInfo,
  getJaasJwt
} = require('../controllers/meeting.controller');
const { listTranscripts, addTranscript } = require('../controllers/transcripts.controller');
const { meetingAiChat, generateMeetingSummary } = require('../controllers/ai.controller');
 
// Public meeting info (no auth required for joining page)
router.get('/code/:code/info', getMeetingInfo);

// Transcripts (persisted)
router.get('/:meetingKey/transcripts', optionalAuth, listTranscripts);
router.post('/:meetingKey/transcripts', auth, addTranscript);

// Meeting AI Q&A
router.post('/:meetingKey/ai/chat', optionalAuth, meetingAiChat);
router.get('/:meetingKey/summary', auth, generateMeetingSummary);

// Meeting CRUD
router.route('/')
  .post(auth, validate(createMeetingSchema), createMeeting)
  .get(auth, getMeetings);

router.route('/:id')
  .get(auth, getMeeting)
  .patch(auth, updateMeeting)
  .delete(auth, deleteMeeting);

// Join/Leave meeting
router.post('/:id/join', optionalAuth, validate(joinMeetingSchema), joinMeeting);
router.post('/:id/leave', optionalAuth, leaveMeeting);

// JaaS Authentication Token
router.get('/:id/jaas-jwt', optionalAuth, getJaasJwt);

module.exports = router;