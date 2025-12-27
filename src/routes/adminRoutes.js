import express from 'express';
import * as adminGuideController from '../controllers/adminGuideController.js';
import * as attractionController from '../controllers/attractionController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireAdmin } from '../middlewares/roleMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import { validateAttractionCreation } from '../utils/validators.js';

const router = express.Router();

/**
 * Admin Routes - /api/admin
 * All routes require authentication and admin role
 */

/**
 * @swagger
 * /admin/guides/pending:
 *   get:
 *     summary: Get all pending guide applications
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of pending guides
 *       403:
 *         description: Forbidden - Admin access required
 */

/**
 * @swagger
 * /admin/guides/{guideId}/verify:
 *   put:
 *     summary: Verify/approve/reject guide document
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: guideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentId
 *               - status
 *             properties:
 *               documentId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *               note:
 *                 type: string
 *                 description: Admin note on approval/rejection
 *     responses:
 *       200:
 *         description: Document verified successfully
 *       400:
 *         description: Invalid status
 */

router.use(authenticate);
router.use(requireAdmin);

/**
 * @swagger
 * /admin/guides/{guideId}:
 *   get:
 *     summary: Get guide details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: guideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Guide details
 */

/**
 * @swagger
 * /admin/guides/{guideId}/documents:
 *   get:
 *     summary: Get guide documents
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: guideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of documents
 */

// Guide management
router.get('/guides/pending', adminGuideController.getPendingGuides);
router.get('/guides/:guideId', adminGuideController.getGuideDetails);
router.get('/guides/:guideId/documents', adminGuideController.getGuideDocuments);
router.put('/guides/:guideId/verify', adminGuideController.verifyGuideDocument);

/**
 * @swagger
 * /admin/attractions:
 *   post:
 *     summary: Create new attraction
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - category
 *               - location
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                   address:
 *                     type: string
 *     responses:
 *       201:
 *         description: Attraction created
 */

/**
 * @swagger
 * /admin/attractions/{id}:
 *   put:
 *     summary: Update attraction
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Attraction updated
 */

/**
 * @swagger
 * /admin/attractions/{id}:
 *   delete:
 *     summary: Delete attraction
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Attraction deleted
 */

// Attraction management
router.post('/attractions', validate(validateAttractionCreation), attractionController.createAttraction);
router.put('/attractions/:id', attractionController.updateAttraction);
router.delete('/attractions/:id', attractionController.deleteAttraction);

export default router;
