const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware'); 
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
  getMeetingInfo
} = require('../controllers/meeting.controller');
const { listTranscripts, addTranscript } = require('../controllers/transcripts.controller');
const { meetingAiChat } = require('../controllers/ai.controller');
 
// Public meeting info (no auth required for joining page)
router.get('/code/:code/info', getMeetingInfo);

router.use(auth);

// Transcripts (persisted)
router.get('/:meetingKey/transcripts', listTranscripts);
router.post('/:meetingKey/transcripts', addTranscript);

// Meeting AI Q&A
router.post('/:meetingKey/ai/chat', meetingAiChat);

// Meeting CRUD
router.route('/')
  .post(validate(createMeetingSchema),  createMeeting)
  .get(getMeetings);

router.route('/:id')
  .get(getMeeting)
  .patch(updateMeeting)
  .delete(deleteMeeting);

// Join/Leave meeting
router.post('/:id/join', validate(joinMeetingSchema), joinMeeting);
router.post('/:id/leave', leaveMeeting);

module.exports = router;