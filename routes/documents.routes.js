const express = require('express');
const router = express.Router();
const { auth, optionalAuth } = require('../middleware/authMiddleware');
const { validate } = require('../validators/documents.validator');
const { createDocumentSchema, updateDocumentSchema } = require('../validators/documents.validator');
const {
  createDocument,
  getDocument,
  getDocuments,
  updateDocument,
  deleteDocument,
} = require('../controllers/documents.controller');

// Note: GET routes use optionalAuth so guests in a meeting can fetch/view documents.
// POST/PATCH/DELETE routes require a full auth token.

// CRUD endpoints
/**
 * @swagger
 * tags:
 *   - name: Documents
 *     description: File metadata stored for meetings
 */

/**
 * @swagger
 * /api/documents:
 *   post:
 *     summary: Create document metadata
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Document'
 *     responses:
 *       201:
 *         description: Created
 *   get:
 *     summary: List documents (optionally filter by meetingId)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: meetingId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.route('/')
  .post(optionalAuth, validate(createDocumentSchema), createDocument)
  .get(optionalAuth, getDocuments);

router.route('/:id')
  .get(optionalAuth, getDocument)
  .patch(auth, validate(updateDocumentSchema), updateDocument)
  .delete(auth, deleteDocument);

module.exports = router;
