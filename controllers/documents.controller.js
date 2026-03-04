const Document = require('../models/Document');

// @desc    Create a new document record (metadata only)
// @route   POST /api/v1/documents
// @access  Private
const createDocument = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      meetingId,
      filename,
      fileType,
      fileUrl,
      size,
      pageCount,
      slides,
    } = req.body;

    const doc = await Document.create({
      meetingId,
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
    const { meetingId } = req.query;
    const query = { isActive: true };
    if (meetingId) query.meetingId = meetingId;

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