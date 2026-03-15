const Document = require('../models/Document');
const Meeting = require('../models/Meeting');

async function resolveMeetingObjectId(meetingIdOrCode) {
  if (!meetingIdOrCode) return null;
  const raw = String(meetingIdOrCode).trim();
  if (!raw) return null;

  // if it looks like a Mongo ObjectId, accept it directly
  if (/^[a-fA-F0-9]{24}$/.test(raw)) return raw;

  const meeting = await Meeting.findOne({ meetingCode: raw }).select('_id').lean();
  return meeting?._id ? String(meeting._id) : null;
}

// @desc    Create a new document record (metadata only)
// @route   POST /api/v1/documents
// @access  Private
const createDocument = async (req, res, next) => {
  try {
    const userId = req.user?._id || null; // null for guest users
    const {
      meetingId,
      meetingCode,
      filename,
      fileType,
      fileUrl,
      size,
      pageCount,
      slides,
    } = req.body;

    const resolvedMeetingId = await resolveMeetingObjectId(meetingId || meetingCode);
    if (!resolvedMeetingId) {
      return res.status(400).json({ success: false, message: 'Invalid meetingId/meetingCode' });
    }

    const doc = await Document.create({
      meetingId: resolvedMeetingId,
      filename,
      fileType,
      fileUrl,
      size,
      pageCount,
      slides,
      uploadedBy: userId,
      processingStatus: 'completed', // assume already uploaded/processed
    });

    res.status(201).json({
      success: true,
      data: doc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single document by ID
// @route   GET /api/v1/documents/:id
// @access  Private
const getDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    List documents (optionally filter by meetingId)
// @route   GET /api/v1/documents
// @access  Private
const getDocuments = async (req, res, next) => {
  try {
    const { meetingId, meetingCode } = req.query;
    const query = { isActive: true };
    if (meetingId || meetingCode) {
      const resolvedMeetingId = await resolveMeetingObjectId(meetingId || meetingCode);
      if (!resolvedMeetingId) {
        return res.status(400).json({ success: false, message: 'Invalid meetingId/meetingCode' });
      }
      query.meetingId = resolvedMeetingId;
    }

    const docs = await Document.find(query).sort({ uploadedAt: -1 });

    res.json({
      success: true,
      data: docs,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update document metadata
// @route   PATCH /api/v1/documents/:id
// @access  Private
const updateDocument = async (req, res, next) => {
  try {
    const allowed = { ...req.body };
    const doc = await Document.findByIdAndUpdate(req.params.id, allowed, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Soft-delete a document
// @route   DELETE /api/v1/documents/:id
// @access  Private
const deleteDocument = async (req, res, next) => {
  try {
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDocument,
  getDocument,
  getDocuments,
  updateDocument,
  deleteDocument,
};