const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  meetingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Meeting', 
    required: true,
    index: true 
  },
  filename: { 
    type: String, 
    required: true 
  },
  fileType: { 
    type: String, 
    enum: ['pdf'], 
    default: 'pdf' 
  },
  
  // Storage
  s3Key: String,
  fileUrl: String,
  size: Number, // in bytes
  
  // PDF specific
  pageCount: { 
    type: Number, 
    default: 0 
  },
  
  // Slide images (stored in S3, referenced here)
  slides: [{
    pageNumber: Number,
    s3Key: String,
    url: String,
    thumbnailUrl: String,
    width: Number,
    height: Number
  }],
  
  uploadedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  uploadedAt: { 
    type: Date, 
    default: Date.now 
  },
  
  // Status
  isActive: { 
    type: Boolean, 
    default: true 
  },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  }
});

module.exports = mongoose.model('Document', documentSchema);