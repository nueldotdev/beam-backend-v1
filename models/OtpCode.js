const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true,
    index: true 
  },
  code: { 
    type: String, 
    required: true 
  },
  purpose: {
    type: String,
    enum: ['login', 'signup', 'password-reset'],
    default: 'login'
  },
  expiresAt: { 
    type: Date, 
    required: true,
    index: true 
  },
  used: { 
    type: Boolean, 
    default: false 
  },
  attempts: {
    type: Number,
    default: 0
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Auto-expire OTPs (TTL index)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OtpCode', otpSchema);