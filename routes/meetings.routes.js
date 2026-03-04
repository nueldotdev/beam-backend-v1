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

router.use(auth);
console.log('validate:', typeof validate);
console.log('createMeeting:', typeof createMeeting);
console.log('joinMeeting:', typeof joinMeeting);
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

// Public meeting info (no auth required for joining page)
router.get('/code/:code/info', getMeetingInfo);

module.exports = router;