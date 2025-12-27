import Joi from "joi";

/**
 * EGYGO VALIDATORS - CLEANED VERSION
 * Only contains validators used in the NEW trip flow
 * Old flow validators removed
 */

// ============================================================================
// AUTHENTICATION VALIDATORS
// ============================================================================

/**
 * Validate registration data
 */
export const validateRegistration = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(100).required(),
    phone: Joi.string().optional(),
    role: Joi.string().valid("tourist", "guide").default("tourist"),
  });

  return schema.validate(data);
};

/**
 * Validate login data
 */
export const validateLogin = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });

  return schema.validate(data);
};

/**
 * Validate OTP
 */
export const validateOTP = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string()
      .length(4)
      .pattern(/^[0-9]+$/)
      .required(),
  });

  return schema.validate(data);
};

/**
 * Validate password change
 */
export const validatePasswordChange = (data) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
  });

  return schema.validate(data);
};

/**
 * Validate email
 */
export const validateEmail = (email) => {
  const schema = Joi.string().email().required();
  return schema.validate(email);
};

// ============================================================================
// GUIDE PROFILE VALIDATORS
// ============================================================================

/**
 * Validate guide profile update
 */
export const validateGuideProfile = (data) => {
  const schema = Joi.object({
    languages: Joi.array().items(Joi.string()).min(1).optional(),
    pricePerHour: Joi.number().min(0).optional(),
    bio: Joi.string().max(1000).optional(),
    isLicensed: Joi.boolean().optional(),
    province: Joi.string().optional(),
    provinces: Joi.array().items(Joi.string()).optional(),
    availability: Joi.array()
      .items(
        Joi.object({
          dayOfWeek: Joi.number().min(0).max(6).required(),
          startTime: Joi.string()
            .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .required(),
          endTime: Joi.string()
            .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .required(),
        })
      )
      .optional(),
  });

  return schema.validate(data);
};

// ============================================================================
// ATTRACTION/PLACE VALIDATORS
// ============================================================================

/**
 * Validate attraction creation
 */
export const validateAttractionCreation = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(200).required(),
    description: Joi.string().min(10).max(2000).required(),
    location: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
      address: Joi.string().required(),
      city: Joi.string().required(),
    }).required(),
    openingHours: Joi.string().optional(),
    ticketPrice: Joi.number().min(0).optional(),
    category: Joi.string()
      .valid(
        "historical",
        "museum",
        "religious",
        "natural",
        "entertainment",
        "other"
      )
      .optional(),
  });

  return schema.validate(data);
};

// ============================================================================
// NEW TRIP FLOW VALIDATORS
// ============================================================================

/**
 * NEW FLOW - Step 1: Validate trip creation without guide
 * Tourist creates trip first, then selects guide later
 */
export const validateNewTripCreation = (data) => {
  const schema = Joi.object({
    startAt: Joi.date().min("now").required(),
    meetingAddress: Joi.string().min(5).max(500).required(),
    meetingPoint: Joi.object({
      type: Joi.string().valid("Point").default("Point"),
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
    }).optional(),
    totalDurationMinutes: Joi.number().min(30).max(720).optional(),
    itinerary: Joi.array()
      .items(
        Joi.object({
          placeId: Joi.string().optional(),
          visitDurationMinutes: Joi.number().min(1).max(480).optional(),
          notes: Joi.string().max(500).optional(),
          ticketRequired: Joi.boolean().optional(),
        })
      )
      .max(10)
      .optional(),
    notes: Joi.string().max(1000).optional(),
    createdFromPlaceId: Joi.string().optional(),
    provinceId: Joi.string().optional(),
    guideId: Joi.string().optional(),
    negotiatedPrice: Joi.number().min(0).optional(),
    callId: Joi.string().optional(),
    agreedByBoth: Joi.boolean().optional(),
    agreementNote: Joi.string().max(1000).optional(),
    meta: Joi.object({
      agreementSource: Joi.string()
        .valid("call", "manual", "proposal", "new_flow", "in_app")
        .optional(),
      agreementNote: Joi.string().max(1000).optional(),
      createdFromPlaceId: Joi.string().optional(),
    }).optional(),
  });

  return schema.validate(data);
};

/**
 * NEW FLOW - Step 3: Validate guide selection for trip
 */
export const validateSelectGuide = (data) => {
  const schema = Joi.object({
    guideId: Joi.string().required(),
  });

  return schema.validate(data);
};

/**
 * NEW FLOW - Step 4: Validate trip call initiation (linked to trip)
 * No body needed - tripId from URL, guideId from trip.selectedGuide
 */
export const validateInitiateTripCall = (data) => {
  const schema = Joi.object({
    // No body validation needed
  });

  return schema.validate(data);
};

/**
 * NEW FLOW - Step 5: Validate end trip call with negotiation results
 */
export const validateEndTripCall = (data) => {
  const schema = Joi.object({
    endReason: Joi.string()
      .valid(
        "completed",
        "timeout",
        "cancelled",
        "no_answer",
        "technical_issue"
      )
      .default("completed"),
    summary: Joi.string().max(2000).optional(),
    negotiatedPrice: Joi.number().min(0).optional(),
    agreedToTerms: Joi.boolean().optional(),
  });

  return schema.validate(data);
};

/**
 * NEW FLOW - Future: Validate guide offer/counter-proposal
 */
export const validateGuideOffer = (data) => {
  const schema = Joi.object({
    proposedPrice: Joi.number().min(0).required(),
    proposedStartAt: Joi.date().iso().min("now").optional(),
    note: Joi.string().max(1000).optional(),
  });

  return schema.validate(data);
};

// ============================================================================
// TRIP PROPOSAL VALIDATORS (if keeping proposal system)
// ============================================================================

/**
 * Validate trip proposal changes (guide proposing to tourist)
 * Used if guide wants to propose changes to confirmed trip
 */
export const validateTripProposal = (data) => {
  const schema = Joi.object({
    proposedItinerary: Joi.array()
      .items(
        Joi.object({
          placeId: Joi.string().optional(),
          visitDurationMinutes: Joi.number().min(1).max(480).optional(),
          notes: Joi.string().max(500).optional(),
          ticketRequired: Joi.boolean().optional(),
        })
      )
      .min(1)
      .max(10)
      .optional(),
    proposedStartAt: Joi.date().iso().min("now").optional(),
    note: Joi.string().max(1000).optional(),
  })
    .or("proposedItinerary", "proposedStartAt")
    .messages({
      "object.missing": "Must propose changes to itinerary or start time",
    });

  return schema.validate(data);
};

/**
 * Validate proposal rejection
 */
export const validateProposalRejection = (data) => {
  const schema = Joi.object({
    rejectionNote: Joi.string().max(500).optional(),
  });

  return schema.validate(data);
};
