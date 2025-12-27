import express from 'express';
import * as attractionController from '../controllers/attractionController.js';
import { authenticate, optionalAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * Attraction Routes - /api/attractions (public)
 */

/**
 * @swagger
 * /attractions:
 *   get:
 *     summary: Get all attractions
 *     tags: [Attractions]
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
 *         description: List of attractions
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
 *                     $ref: '#/components/schemas/Attraction'
 */

/**
 * @swagger
 * /attractions/{id}:
 *   get:
 *     summary: Get attraction by ID
 *     tags: [Attractions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Attraction details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Attraction'
 *       404:
 *         description: Attraction not found
 */

// Public routes (no auth required)
router.get('/', optionalAuth, attractionController.getAllAttractions);
router.get('/:id', optionalAuth, attractionController.getAttractionById);

// NOTE: Direct booking from attractions removed
// In NEW flow: Tourist creates trip first, then selects guide
// Use POST /api/tourist/trips instead

export default router;
