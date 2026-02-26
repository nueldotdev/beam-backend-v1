const mongoose = require('mongoose');

const transcriptSchema = new mongoose.Schema({
  meetingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Meeting', 
    required: true,
    index: true 
  },
  
  // Speaker info
  speakerId: String,
  speakerName: { 
    type: String, 
    required: true 
  },
  
  content: { 
    type: String, 
    required: true 
  },
  
  // Timing
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  startTime: Number, // seconds from meeting start
  endTime: Number,
  duration: Number, // in seconds
  
  // Metadata
  isFinal: { 
    type: Boolean, 
    default: false 
  },
  confidence: Number
});

// Index for searching
transcriptSchema.index({ content: 'text' });

module.exports = mongoose.model('Transcript', transcriptSchema);