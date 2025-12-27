/**
 * Place Routes
 * API routes for provinces and places
 */

import express from 'express';
import * as provinceController from '../controllers/provinceController.js';
import * as placeController from '../controllers/placeController.js';
import * as guideController from '../controllers/guideController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { uploadSingleDocument, handleMulterError } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// Province routes
router.get('/provinces', provinceController.getAllProvinces);
router.get('/provinces/search', provinceController.searchProvinces);
router.get('/provinces/:slug', provinceController.getProvinceBySlug);
router.get('/provinces/:slug/stats', provinceController.getProvinceStats);
router.get('/provinces/:slug/places', placeController.getPlacesByProvince);

// Task 2: Guide routes for provinces
router.get('/provinces/:slug/guides', guideController.listGuidesByProvince);

// Place routes
router.get('/places', placeController.getAllPlaces);
router.get('/places/search', placeController.searchPlaces);
router.get('/places/near', placeController.getPlacesNear);
router.get('/places/:id', placeController.getPlaceById);

// Task 2: Public guide routes
router.get('/guides/:id', guideController.getGuideDetails);

// Task 2: Authenticated guide routes
router.post('/guides/me/profile', authenticate, guideController.createOrUpdateProfile);
router.get('/guides/me', authenticate, guideController.getOwnProfile);
router.post('/guides/:id/documents', authenticate, uploadSingleDocument, handleMulterError, guideController.uploadGuideDocument);

export default router;
