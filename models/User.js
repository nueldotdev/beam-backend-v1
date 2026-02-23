const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String },
  provider: { type: String, enum: ['default', 'google', 'github', 'microsoft'], default: 'default' },
  providerId: { type: String, sparse: true, unique: true },
  profile: {
    firstName: String,
    lastName: String,
    avatar: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('User', userSchema);
