const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  title: { 
    type: String, 
    default: 'Untitled Meeting' 
  },
  meetingCode: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  hostUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'ended', 'scheduled'], 
    default: 'active' 
  },
  settings: {
    waitingRoom: { type: Boolean, default: true },
    locked: { type: Boolean, default: false },
    allowDownload: { type: Boolean, default: true }
  },
  startedAt: Date,
  endedAt: Date,
  
  // Real-time tracking
  currentSlide: { 
    type: Number, 
    default: 0 
  },
  activeDocumentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  },
  
  // Stats
  participantCount: { 
    type: Number, 
    default: 0 
  },
  duration: Number, // in minutes
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Update timestamp on save
meetingSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

// Generate meeting code before saving
meetingSchema.pre('save', async function() {
  if (!this.meetingCode) {
    this.meetingCode = generateMeetingCode();
  }
});

function generateMeetingCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = mongoose.model('Meeting', meetingSchema);