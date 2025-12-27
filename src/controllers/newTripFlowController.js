import mongoose from "mongoose";
import newTripFlowService from "../services/newTripFlowService.js";
import { HTTP_STATUS } from "../utils/constants.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { getIpAddress, getUserAgent } from "../utils/auditLogger.js";

/**
 * NEW TRIP FLOW CONTROLLERS
 *
 * Implements the redesigned trip creation flow controllers
 */

/**
 * STEP 1: Create trip without guide
 * POST /api/tourist/trips (NEW VERSION)
 */
export const createTripNewFlow = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await newTripFlowService.createTripWithoutGuide(
    req.userId,
    req.body,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    ...result,
  });
});

/**
 * STEP 2: Get compatible guides for a trip
 * GET /api/tourist/trips/:tripId/guides
 */
export const getTripGuides = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const filters = {
    language: req.query.language,
    maxDistanceKm: req.query.maxDistanceKm,
    page: req.query.page,
    limit: req.query.limit,
  };

  const { guides, pagination, trip } =
    await newTripFlowService.getTripCompatibleGuides(tripId, filters);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: guides,
    pagination,
    trip,
  });
});

/**
 * STEP 3: Select a guide for the trip
 * POST /api/tourist/trips/:tripId/select-guide
 */
export const selectGuideForTrip = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const { guideId } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await newTripFlowService.selectGuideForTrip(
    tripId,
    req.userId,
    guideId,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * STEP 4: Initiate call for trip
 * POST /api/trips/:tripId/calls/initiate
 */
export const initiateTripCall = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const touristUserId = req.userId;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  console.log("=== INITIATE TRIP CALL REQUEST ===");
  console.log("Trip ID:", tripId);
  console.log("Tourist User ID:", touristUserId);
  console.log("Request Headers:", {
    authorization: req.headers.authorization ? "Present" : "Missing",
    contentType: req.headers["content-type"],
  });

  // Validate trip ID format
  if (!mongoose.Types.ObjectId.isValid(tripId)) {
    console.error("Invalid trip ID format:", tripId);
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Invalid trip ID format",
    });
  }

  // Validate tourist user ID format
  if (!mongoose.Types.ObjectId.isValid(touristUserId)) {
    console.error("Invalid tourist user ID format:", touristUserId);
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Invalid tourist user ID format",
    });
  }

  try {
    const result = await newTripFlowService.initiateTripCall(
      tripId,
      touristUserId,
      ipAddress,
      userAgent
    );

    console.log("Call initiated successfully:", {
      callId: result.callId,
      tripId: result.trip?.id,
    });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error in initiateTripCall controller:", error.message);
    throw error; // Let asyncHandler handle it
  }
});

/**
 * STEP 5: End trip call with negotiation
 * POST /api/calls/:callId/end (ENHANCED VERSION)
 */
export const endTripCall = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await newTripFlowService.endTripCall(
    callId,
    req.userId,
    req.body,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * STEP 6a: Guide accepts trip
 * PUT /api/guide/trips/:tripId/accept (ENHANCED VERSION)
 */
export const guideAcceptTripNewFlow = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await newTripFlowService.guideAcceptTrip(
    tripId,
    req.userId,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * STEP 6b: Guide rejects trip
 * PUT /api/guide/trips/:tripId/reject (ENHANCED VERSION)
 */
export const guideRejectTripNewFlow = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const { reason } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await newTripFlowService.guideRejectTrip(
    tripId,
    req.userId,
    reason,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});
