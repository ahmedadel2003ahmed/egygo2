import express from "express";
import * as newTripFlowController from "../controllers/newTripFlowController.js";
import * as paymentController from "../controllers/paymentController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { requireTourist, requireGuide } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validateMiddleware.js";
import { validateObjectId } from "../middlewares/validateObjectId.js";
import { normalizeMeta } from "../middlewares/normalizeMeta.js";
import {
  validateNewTripCreation,
  validateSelectGuide,
  validateEndTripCall,
} from "../utils/validators.js";

const router = express.Router();

/**
 * NEW TRIP FLOW ROUTES
 *
 * Redesigned flow: Create Trip → Select Guide → Call → Confirm
 */

/**
 * @swagger
 * /tourist/trips:
 *   post:
 *     summary: Create trip without guide (NEW FLOW - Step 1)
 *     description: Tourist creates a trip first, then selects a guide later
 *     tags: [Trip - New Flow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startAt
 *               - meetingAddress
 *             properties:
 *               startAt:
 *                 type: string
 *                 format: date-time
 *                 description: Trip start time (must be in future)
 *                 example: "2025-12-05T09:00:00Z"
 *               meetingAddress:
 *                 type: string
 *                 description: Where to meet the guide
 *                 example: "Giza Pyramids Main Entrance, Cairo"
 *               meetingPoint:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [Point]
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                     example: [31.1342, 29.9792]
 *               totalDurationMinutes:
 *                 type: number
 *                 minimum: 30
 *                 maximum: 720
 *                 default: 240
 *               itinerary:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     placeId:
 *                       type: string
 *                     visitDurationMinutes:
 *                       type: number
 *                     notes:
 *                       type: string
 *               notes:
 *                 type: string
 *               createdFromPlaceId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Trip created successfully, status = selecting_guide
 *       400:
 *         description: Validation error
 */
router.post(
  "/tourist/trips",
  authenticate,
  requireTourist,
  normalizeMeta,
  validate(validateNewTripCreation),
  newTripFlowController.createTripNewFlow
);

/**
 * @swagger
 * /tourist/trips/{tripId}/guides:
 *   get:
 *     summary: Get compatible guides for trip (NEW FLOW - Step 2)
 *     description: Returns list of verified guides compatible with the trip
 *     tags: [Trip - New Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by language
 *       - in: query
 *         name: maxDistanceKm
 *         schema:
 *           type: number
 *           default: 50
 *         description: Maximum distance from meeting point
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
 *         description: List of compatible guides
 *       404:
 *         description: Trip not found
 */
router.get(
  "/tourist/trips/:tripId/guides",
  authenticate,
  requireTourist,
  newTripFlowController.getTripGuides
);

/**
 * @swagger
 * /tourist/trips/{tripId}/select-guide:
 *   post:
 *     summary: Select a guide for the trip (NEW FLOW - Step 3)
 *     description: Tourist selects a guide. Status changes to awaiting_call
 *     tags: [Trip - New Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
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
 *               - guideId
 *             properties:
 *               guideId:
 *                 type: string
 *                 description: ID of the guide to select
 *     responses:
 *       200:
 *         description: Guide selected successfully
 *       400:
 *         description: Invalid guide or trip status
 *       404:
 *         description: Trip or guide not found
 */
router.post(
  "/tourist/trips/:tripId/select-guide",
  authenticate,
  requireTourist,
  validate(validateSelectGuide),
  newTripFlowController.selectGuideForTrip
);

/**
 * @swagger
 * /trips/{tripId}/calls/initiate:
 *   post:
 *     summary: Initiate call for trip (NEW FLOW - Step 4)
 *     description: Tourist initiates call with selected guide to discuss trip
 *     tags: [Trip - New Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Call initiated successfully
 *       400:
 *         description: No guide selected or invalid status
 *       404:
 *         description: Trip not found
 */
router.post(
  "/trips/:tripId/calls/initiate",
  validateObjectId("tripId"),
  authenticate,
  newTripFlowController.initiateTripCall
);

/**
 * @swagger
 * /calls/{callId}/end:
 *   post:
 *     summary: End call with negotiation results (NEW FLOW - Step 5)
 *     description: End call and save negotiation details. Status changes to pending_confirmation
 *     tags: [Trip - New Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endReason:
 *                 type: string
 *                 enum: [completed, timeout, cancelled, no_answer, technical_issue]
 *               summary:
 *                 type: string
 *                 description: Summary of what was discussed
 *               negotiatedPrice:
 *                 type: number
 *                 description: Price agreed upon during call
 *               agreedToTerms:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Call ended, trip awaiting guide confirmation
 */
router.post(
  "/calls/:callId/end",
  authenticate,
  validate(validateEndTripCall),
  newTripFlowController.endTripCall
);

/**
 * @swagger
 * /guide/trips/{tripId}/accept:
 *   put:
 *     summary: Guide accepts trip (NEW FLOW - Step 6a)
 *     description: Guide accepts the trip. Status changes to confirmed
 *     tags: [Trip - New Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trip accepted successfully
 *       400:
 *         description: Invalid status or not the selected guide
 *       404:
 *         description: Trip not found
 */
router.put(
  "/guide/trips/:tripId/accept",
  authenticate,
  requireGuide,
  newTripFlowController.guideAcceptTripNewFlow
);

/**
 * @swagger
 * /guide/trips/{tripId}/reject:
 *   put:
 *     summary: Guide rejects trip (NEW FLOW - Step 6b)
 *     description: Guide rejects the trip. Status changes to rejected
 *     tags: [Trip - New Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for rejection
 *     responses:
 *       200:
 *         description: Trip rejected successfully
 *       400:
 *         description: Invalid status or not the selected guide
 *       404:
 *         description: Trip not found
 */
router.put(
  "/guide/trips/:tripId/reject",
  authenticate,
  requireGuide,
  newTripFlowController.guideRejectTripNewFlow
);

/**
 * @swagger
 * /tourist/trips/{tripId}/create-checkout-session:
 *   post:
 *     summary: Create Stripe Checkout session for trip payment (NEW FLOW - Step 7)
 *     description: Tourist creates a Stripe Checkout session to pay for the trip after guide accepts
 *     tags: [Trip - New Flow, Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *         description: Trip ID
 *     responses:
 *       200:
 *         description: Checkout session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 checkoutUrl:
 *                   type: string
 *                   description: Stripe Checkout URL to redirect user to
 *                 sessionId:
 *                   type: string
 *                   description: Stripe session ID
 *       400:
 *         description: Invalid trip status or already paid
 *       403:
 *         description: Not authorized (not trip owner)
 *       404:
 *         description: Trip not found
 */
router.post(
  "/tourist/trips/:tripId/create-checkout-session",
  authenticate,
  requireTourist,
  paymentController.createCheckoutSessionForTrip
);

export default router;
