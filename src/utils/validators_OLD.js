import Joi from 'joi';

/**
 * Validate registration data
 */
export const validateRegistration = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(100).required(),
    phone: Joi.string().optional(),
    role: Joi.string().valid('tourist', 'guide').default('tourist'),
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
    otp: Joi.string().length(4).pattern(/^[0-9]+$/).required(),
  });

  return schema.validate(data);
};

/**
 * Validate guide profile update
 */
export const validateGuideProfile = (data) => {
  const schema = Joi.object({
    languages: Joi.array().items(Joi.string()).min(1).optional(),
    pricePerHour: Joi.number().min(0).optional(),
    bio: Joi.string().max(1000).optional(),
    isLicensed: Joi.boolean().optional(),
    availability: Joi.array().items(
      Joi.object({
        dayOfWeek: Joi.number().min(0).max(6).required(),
        startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
        endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      })
    ).optional(),
  });

  return schema.validate(data);
};

/**
 * Validate trip creation
 */
export const validateTripCreation = (data) => {
  const schema = Joi.object({
    guideId: Joi.string().required(),
    startAt: Joi.date().iso().min('now').required(),
    durationHours: Joi.number().min(1).max(24).required(),
    meetingPoint: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).optional(),
      address: Joi.string().required(),
    }).required(),
    notes: Joi.string().max(500).optional(),
  });

  return schema.validate(data);
};

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
    category: Joi.string().valid('historical', 'museum', 'religious', 'natural', 'entertainment', 'other').optional(),
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

/**
 * Validate trip estimate request
 */
export const validateTripEstimate = (data) => {
  const schema = Joi.object({
    itinerary: Joi.array()
      .items(
        Joi.object({
          placeId: Joi.string().required(),
          visitDurationMinutes: Joi.number().min(1).max(480).required(),
          notes: Joi.string().max(500).optional(),
          ticketRequired: Joi.boolean().optional(),
        })
      )
      .min(1)
      .max(10)
      .required(),
    startAt: Joi.date().iso().min('now').required(),
    guideId: Joi.string().optional(),
  });

  return schema.validate(data);
};

/**
 * Validate multi-place trip creation
 */
export const validateMultiPlaceTripCreation = (data) => {
  const schema = Joi.object({
    itinerary: Joi.array()
      .items(
        Joi.object({
          placeId: Joi.string().required(),
          visitDurationMinutes: Joi.number().min(1).max(480).required(),
          notes: Joi.string().max(500).optional(),
          ticketRequired: Joi.boolean().optional(),
        })
      )
      .min(1)
      .max(10)
      .required(),
    startAt: Joi.date().iso().min('now').required(),
    guideId: Joi.string().optional(),
    meetingPoint: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).optional(),
    }).optional(),
    meetingAddress: Joi.string().max(500).optional(),
    notes: Joi.string().max(500).optional(),
    createdFromPlaceId: Joi.string().optional(),
    callId: Joi.string().optional(),
  });

  return schema.validate(data);
};

/**
 * Validate trip proposal changes (guide proposing to tourist)
 */
export const validateTripProposal = (data) => {
  const schema = Joi.object({
    proposedItinerary: Joi.array()
      .items(
        Joi.object({
          placeId: Joi.string().required(),
          visitDurationMinutes: Joi.number().min(1).max(480).required(),
          notes: Joi.string().max(500).optional(),
          ticketRequired: Joi.boolean().optional(),
        })
      )
      .min(1)
      .max(10)
      .optional(),
    proposedStartAt: Joi.date().iso().min('now').optional(),
    note: Joi.string().max(1000).optional(),
  })
    .or('proposedItinerary', 'proposedStartAt') // At least one must be present
    .messages({
      'object.missing': 'Must propose changes to itinerary or start time',
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

/**
 * Validate booking from attraction/place page
 */
export const validateBookFromPlace = (data) => {
  const schema = Joi.object({
    itinerary: Joi.array()
      .items(
        Joi.object({
          placeId: Joi.string().required(),
          visitDurationMinutes: Joi.number().min(1).max(480).required(),
          notes: Joi.string().max(500).optional(),
          ticketRequired: Joi.boolean().optional(),
        })
      )
      .min(1)
      .max(10)
      .optional(), // Optional, will use default if not provided
    startAt: Joi.date().iso().min('now').required(),
    guideId: Joi.string().optional(),
    notes: Joi.string().max(500).optional(),
  });

  return schema.validate(data);
};

/**
 * Validate call initiation
 */
export const validateInitiateCall = (data) => {
  const schema = Joi.object({
    guideId: Joi.string().required(),
    tripId: Joi.string().optional(),
  });

  return schema.validate(data);
};

/**
 * Validate end call
 */
export const validateEndCall = (data) => {
  const schema = Joi.object({
    reason: Joi.string()
      .valid('completed', 'timeout', 'cancelled', 'error')
      .optional(),
  });

  return schema.validate(data);
};

/**
 * NEW FLOW: Validate trip creation without guide
 */
export const validateNewTripCreation = (data) => {
  const schema = Joi.object({
    startAt: Joi.date().iso().min('now').required(),
    meetingAddress: Joi.string().min(5).max(500).required(),
    meetingPoint: Joi.object({
      type: Joi.string().valid('Point').default('Point'),
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
      .min(1)
      .max(10)
      .optional(),
    notes: Joi.string().max(1000).optional(),
    createdFromPlaceId: Joi.string().optional(),
  });

  return schema.validate(data);
};

/**
 * NEW FLOW: Validate guide selection for trip
 */
export const validateSelectGuide = (data) => {
  const schema = Joi.object({
    guideId: Joi.string().required(),
  });

  return schema.validate(data);
};

/**
 * NEW FLOW: Validate trip call initiation (linked to trip)
 */
export const validateInitiateTripCall = (data) => {
  const schema = Joi.object({
    // No body needed - tripId is in URL, guideId comes from trip.selectedGuide
  });

  return schema.validate(data);
};

/**
 * NEW FLOW: Validate end trip call with negotiation
 */
export const validateEndTripCall = (data) => {
  const schema = Joi.object({
    endReason: Joi.string()
      .valid('completed', 'timeout', 'cancelled', 'no_answer', 'technical_issue')
      .default('completed'),
    summary: Joi.string().max(2000).optional(),
    negotiatedPrice: Joi.number().min(0).optional(),
    agreedToTerms: Joi.boolean().optional(),
  });

  return schema.validate(data);
};

/**
 * NEW FLOW: Validate guide offer/proposal
 */
export const validateGuideOffer = (data) => {
  const schema = Joi.object({
    proposedPrice: Joi.number().min(0).required(),
    proposedStartAt: Joi.date().iso().min('now').optional(),
    note: Joi.string().max(1000).optional(),
  });

  return schema.validate(data);
};
