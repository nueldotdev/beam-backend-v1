const Transcript = require('../models/Transcript');
const { resolveMeetingByKey } = require('../utils/resolveMeeting');

const listTranscripts = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const transcripts = await Transcript.find({ meetingId: meeting._id })
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: transcripts });
  } catch (e) {
    next(e);
  }
};

const addTranscript = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const speakerName = String(req.body.speakerName || 'Unknown').slice(0, 120);
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: 'content required' });

    const doc = await Transcript.create({
      meetingId: meeting._id,
      speakerId: req.user?._id ? String(req.user._id) : undefined,
      speakerName,
      content,
      isFinal: !!req.body.isFinal,
      confidence: req.body.confidence,
      timestamp: new Date(),
    });

    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

module.exports = { listTranscripts, addTranscript };

