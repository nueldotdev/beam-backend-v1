const express = require('express');
const router = express.Router();
const { register, login, googleOAuthUrl, googleOAuthHandler } = require('../controllers/authController');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

// Public endpoints
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       '201':
 *         description: User created, returns token and user info
 *       '400':
 *         description: Fields required
 *       '409':
 *         description: User with that email already exists
 *       '500':
 *         description: Server error
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Authenticated, returns token
 *       '400':
 *         description: Email and password required
 *       '401':
 *         description: Invalid credentials
 *       '500':
 *         description: Server error
 */
router.post('/login', login);

// Google OAuth helpers
/**
 * @swagger
 * /api/auth/google/url:
 *   get:
 *     summary: Get URL to start Google OAuth flow
 *     tags: [Auth]
 *     responses:
 *       '200':
 *         description: URL returned in JSON
 */
router.get('/google/url', googleOAuthUrl);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: OAuth callback endpoint used by Google
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: Authorization code from Google
 *     responses:
 *       '200':
 *         description: Returns app JWT and user info
 *       '400':
 *         description: Missing code
 *       '500':
 *         description: Server error
 */
router.get('/google/callback', googleOAuthHandler);

module.exports = router;
