const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
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
  
  messageType: { 
    type: String, 
    enum: ['user', 'assistant', 'system'], 
    required: true 
  },
  
  content: { 
    type: String, 
    required: true 
  },
  
  // For AI responses
  metadata: {
    sources: [{
      type: { type: String, enum: ['transcript', 'slide'] },
      reference: String,
      timestamp: Number,
      slideNumber: Number,
      text: String
    }],
    feedback: {
      helpful: Boolean,
      feedbackText: String
    }
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);