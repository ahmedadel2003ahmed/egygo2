import express from "express";
import * as guideController from "../controllers/guideController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { requireGuide } from "../middlewares/roleMiddleware.js";
import {
  uploadGuideDocuments,
  uploadSingleDocument,
  uploadGalleryImages,
  handleMulterError,
} from "../middlewares/uploadMiddleware.js";
import { validate } from "../middlewares/validateMiddleware.js";
import {
  validateGuideProfile,
  validateTripProposal,
} from "../utils/validators.js";

const router = express.Router();

/**
 * Guide Routes - /api/guide
 * All routes require authentication and guide role
 */

/**
 * @swagger
 * /guide/apply:
 *   post:
 *     summary: Apply as a guide (with document uploads)
 *     tags: [Guide]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - languages
 *               - pricePerHour
 *               - isLicensed
 *               - idDocument
 *               - photo
 *             properties:
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [English, Arabic]
 *               pricePerHour:
 *                 type: number
 *                 example: 50
 *               bio:
 *                 type: string
 *                 maxLength: 1000
 *               isLicensed:
 *                 type: boolean
 *               idDocument:
 *                 type: string
 *                 format: binary
 *               tourismCard:
 *                 type: string
 *                 format: binary
 *                 description: Required if isLicensed is true
 *               englishCertificate:
 *                 type: string
 *                 format: binary
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Guide profile photo (required)
 *               otherDocs:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Guide application submitted successfully
 *       400:
 *         description: Bad request - missing required documents
 */
router.use(authenticate);

// Apply as guide (doesn't require guide role - for tourists applying)
router.post(
  "/apply",
  uploadGuideDocuments,
  handleMulterError,
  guideController.applyAsGuide
);

// Guide-specific routes
router.use(requireGuide);

/**
 * @swagger
 * /guide/profile:
 *   get:
 *     summary: Get guide profile
 *     tags: [Guide]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Guide profile
 */

/**
 * @swagger
 * /guide/profile:
 *   put:
 *     summary: Update guide profile
 *     tags: [Guide]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *               pricePerHour:
 *                 type: number
 *               bio:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */

// Profile
router.get("/profile", guideController.getProfile);
router.put(
  "/profile",
  validate(validateGuideProfile),
  guideController.updateProfile
);

/**
 * @swagger
 * /guide/documents:
 *   get:
 *     summary: Get uploaded documents
 *     tags: [Guide]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of documents
 */

/**
 * @swagger
 * /guide/documents:
 *   post:
 *     summary: Upload additional document
 *     tags: [Guide]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Document uploaded
 */

/**
 * @swagger
 * /guide/documents/{documentId}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Guide]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document deleted
 */

// Documents
router.get("/documents", guideController.getDocuments);
router.post(
  "/documents",
  uploadSingleDocument,
  handleMulterError,
  guideController.uploadDocument
);
router.delete("/documents/:documentId", guideController.deleteDocument);

/**
 * @swagger
 * /guide/trips:
 *   get:
 *     summary: Get guide's trips
 *     tags: [Guide]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of trips
 */

/**
 * @swagger
 * /guide/trips/{id}/accept:
 *   put:
 *     summary: Accept a trip request
 *     tags: [Guide]
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
 *         description: Trip accepted
 */

/**
 * @swagger
 * /guide/trips/{id}/complete:
 *   put:
 *     summary: Mark trip as completed
 *     tags: [Guide]
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
 *         description: Trip completed
 */

// Trips
router.get("/trips", guideController.getTrips);
router.get("/trips/:id", guideController.getTrip);
router.put("/trips/:id/accept", guideController.acceptTrip);
router.put("/trips/:id/reject", guideController.rejectTrip);
router.put("/trips/:id/complete", guideController.completeTrip);
router.put("/trips/:id/cancel", guideController.cancelTrip);
router.put(
  "/trips/:id/propose-change",
  validate(validateTripProposal),
  guideController.proposeChange
);
router.get("/calls/incoming", guideController.getIncomingCalls);

// Gallery routes
router.post(
  "/gallery",
  uploadGalleryImages,
  handleMulterError,
  guideController.uploadGalleryImages
);
router.delete("/gallery/:imageId", guideController.deleteGalleryImage);

export default router;
