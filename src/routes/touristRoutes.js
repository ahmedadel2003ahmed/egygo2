import express from 'express';
import * as touristController from '../controllers/touristController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireTourist } from '../middlewares/roleMiddleware.js';
import { uploadAvatar, handleMulterError } from '../middlewares/uploadMiddleware.js';
import { validate } from '../middlewares/validateMiddleware.js';
import { validateProposalRejection } from '../utils/validators.js';

const router = express.Router();

/**
 * Tourist Routes - /api/tourist
 * All routes require authentication and tourist role
 */

/**
 * @swagger
 * /tourist/guides:
 *   get:
 *     summary: Browse guides with filters
 *     tags: [Tourist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by language
 *       - in: query
 *         name: priceMin
 *         schema:
 *           type: number
 *         description: Minimum price per hour
 *       - in: query
 *         name: priceMax
 *         schema:
 *           type: number
 *         description: Maximum price per hour
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
 *         description: List of guides
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Guide'
 */

/**
 * @swagger
 * /tourist/trips:
 *   post:
 *     summary: Create a trip request
 *     tags: [Tourist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - guideId
 *               - startAt
 *               - durationHours
 *               - meetingPoint
 *             properties:
 *               guideId:
 *                 type: string
 *               startAt:
 *                 type: string
 *                 format: date-time
 *                 example: 2024-12-25T10:00:00Z
 *               durationHours:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 24
 *                 example: 4
 *               meetingPoint:
 *                 type: object
 *                 required:
 *                   - address
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                     example: [31.2357, 30.0444]
 *                   address:
 *                     type: string
 *                     example: Pyramids of Giza
 *               notes:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Trip created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 trip:
 *                   $ref: '#/components/schemas/Trip'
 */

// Public routes (Guides)
router.get('/guides', touristController.getGuides);
router.get('/guides/:id', touristController.getGuide);

router.use(authenticate);
router.use(requireTourist);

/**
 * @swagger
 * /tourist/profile:
 *   get:
 *     summary: Get tourist profile
 *     tags: [Tourist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tourist profile
 */

/**
 * @swagger
 * /tourist/profile:
 *   put:
 *     summary: Update tourist profile
 *     tags: [Tourist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile updated
 */

// Profile
router.get('/profile', touristController.getProfile);
router.put('/profile', uploadAvatar, handleMulterError, touristController.updateProfile);

/**
 * @swagger
 * /tourist/attractions:
 *   get:
 *     summary: Browse attractions
 *     tags: [Tourist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of attractions
 */

/**
 * @swagger
 * /tourist/attractions/{id}:
 *   get:
 *     summary: Get attraction details
 *     tags: [Tourist]
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
 *         description: Attraction details
 */

// Attractions
router.get('/attractions', touristController.getAttractions);
router.get('/attractions/:id', touristController.getAttraction);

/**
 * @swagger
 * /tourist/guides/{id}:
 *   get:
 *     summary: Get guide details
 *     tags: [Tourist]
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
 *         description: Guide details
 */

// Guides (Moved to public section above)
// router.get('/guides', touristController.getGuides);
// router.get('/guides/:id', touristController.getGuide);

// NOTE: Trip creation moved to newTripFlowRoutes.js
// POST /api/tourist/trips (NEW FLOW - create without guide)
// router.post('/trips', validate(validateTripRequest), touristController.createTrip);

/**
 * @swagger
 * /tourist/trips/{id}:
 *   get:
 *     summary: Get trip details
 *     tags: [Tourist]
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
 *         description: Trip details
 */

/**
 * @swagger
 * /tourist/trips/{id}/cancel:
 *   put:
 *     summary: Cancel a trip
 *     tags: [Tourist]
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
 *         description: Trip cancelled
 */

// NOTE: Trip creation moved to newTripFlowRoutes.js
// POST /api/tourist/trips (NEW FLOW - create without guide)

// Trips - Read only
router.get('/trips', touristController.getTrips);
router.get('/trips/:id', touristController.getTrip);
router.put('/trips/:id/cancel', touristController.cancelTrip);
router.put('/trips/:id/accept-proposal', touristController.acceptProposal);
router.put('/trips/:id/reject-proposal', validate(validateProposalRejection), touristController.rejectProposal);
router.post('/trips/:id/review', touristController.reviewTrip);

// NOTE: Call-to-trip conversion removed - no longer needed in NEW flow
// In NEW flow: Create Trip → Select Guide → Call (not the other way around)

export default router;
