const express = require('express'); 
const cors = require('cors'); 
const helmet = require('helmet');

const logger = require('../middleware/loggerMiddleware');
require('dotenv').config(); 

const app = express(); 

app.use(helmet()); 

// configure CORS to allow only the frontend URL from env
const frontendUrl = process.env.BEAM_FRONTEND_URL || '*';
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());


// app.use(logger);

// swagger setup
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../docs/api/swagger');
app.use('/docs/api', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// routes
const authRoutes = require('../routes/auth');
const auth = require('../middleware/authMiddleware');

app.use('/api/auth', authRoutes);

/**
 * @swagger
 * tags:
 *   - name: Health
 *     description: Health check
 */

// health check
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/api/health', (req, res) => res.json({ status: 'ok' })); 

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Protected profile endpoint
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Protected data
 *       401:
 *         description: Unauthorized
 */
// example of protected endpoint
app.get('/api/profile', auth, (req, res) => {
  // req.user will have the jwt payload
  res.json({ message: 'protected data', user: req.user });
});

// database connection
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Mongo connection error', err));

const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`)
}); 