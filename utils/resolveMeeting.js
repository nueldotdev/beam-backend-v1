const Meeting = require('../models/Meeting');

async function resolveMeetingByKey(meetingKey) {
  const raw = String(meetingKey || '').trim();
  if (!raw) return null;

  if (/^[a-fA-F0-9]{24}$/.test(raw)) {
    const meeting = await Meeting.findById(raw).lean();
    return meeting || null;
  }

  const meeting = await Meeting.findOne({ meetingCode: new RegExp(`^${raw}$`, 'i') }).lean();
  return meeting || null;
}

module.exports = { resolveMeetingByKey };

