const express = require('express'); 
const cors = require('cors'); 
const helmet = require('helmet'); 
require('dotenv').config(); 

const app = express(); 

app.use(helmet()); 
app.use(cors()); 
app.use(express.json()); 

// routes
const authRoutes = require('../routes/auth');
const auth = require('../middleware/authMiddleware');

app.use('/api/auth', authRoutes);

// health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' })); 

// example of protected endpoint
app.get('/api/profile', auth, (req, res) => {
  // req.user will have the jwt payload
  res.json({ message: 'protected data', user: req.user });
});

// database connection
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/beam';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Mongo connection error', err));

const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => console.log('API running on port ' + PORT));
