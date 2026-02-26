const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  meetingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Meeting', 
    required: true,
    index: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  displayName: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['host', 'participant'], 
    default: 'participant' 
  },
  
  // Session tracking
  joinedAt: { 
    type: Date, 
    default: Date.now 
  },
  leftAt: Date,
  
  // Real-time status
  isOnline: { 
    type: Boolean, 
    default: true 
  },
  audioMuted: { 
    type: Boolean, 
    default: false 
  },
  videoOff: { 
    type: Boolean, 
    default: false 
  },
  
  // Connection quality
  connectionQuality: {
    type: String,
    enum: ['good', 'fair', 'poor'],
    default: 'good'
  }
});

// Compound index for unique active participant
participantSchema.index({ meetingId: 1, userId: 1 }, { 
  unique: true, 
  partialFilterExpression: { leftAt: null } 
});

module.exports = mongoose.model('Participant', participantSchema);