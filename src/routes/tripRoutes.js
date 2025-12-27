import express from 'express';
import * as tripController from '../controllers/tripController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * Trip Routes - /api/trips (shared)
 * All routes require authentication
 * 
 * NOTE: Trip creation is now in newTripFlowRoutes.js
 * POST /api/tourist/trips (create without guide)
 */

router.use(authenticate);

// NOTE: Trip estimation removed - not needed in NEW flow
// Tourist creates trip directly with meeting details

router.get('/', tripController.getAllTrips);
router.get('/:id', tripController.getTripById);

export default router;
