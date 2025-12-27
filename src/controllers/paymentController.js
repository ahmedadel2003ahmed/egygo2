import Stripe from "stripe";
import Trip from "../models/Trip.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { HTTP_STATUS } from "../utils/constants.js";
import { TRIP_STATES, validateTransition } from "../utils/tripStateMachine.js";
import { emitTripStatusUpdate } from "../sockets/tripSocketEmitter.js";

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});
(async () => {
  try {
    const account = await stripe.accounts.retrieve();
    console.log("🔐 BACKEND STRIPE ACCOUNT:", account.id, account.email);
  } catch (err) {
    console.error("❌ Failed to retrieve Stripe account:", err.message);
  }
})();

/**
 * POST /api/tourist/trips/:tripId/create-checkout-session
 * Create a Stripe Checkout Session for trip payment
 *
 * Security:
 * - Tourist must be authenticated and own the trip
 * - Amount is calculated server-side from trip.negotiatedPrice
 * - Session is ephemeral and single-use (never stored or reused)
 * - Metadata always includes tripId for webhook processing
 */
export const createCheckoutSessionForTrip = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const touristId = req.userId;

  console.log(
    `[PAYMENT_DEBUG] Creating checkout session for trip ${tripId}, tourist ${touristId}`
  );

  // Load trip with populated guide and tourist data
  const trip = await Trip.findById(tripId)
    .populate("selectedGuide", "name user")
    .populate("tourist", "name email");

  if (!trip) {
    console.log(`[PAYMENT_DEBUG] Trip ${tripId} not found`);
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: "Trip not found",
    });
  }

  // Verify tourist ownership
  if (trip.tourist._id.toString() !== touristId.toString()) {
    console.log(
      `[PAYMENT_DEBUG] Tourist ${touristId} does not own trip ${tripId}`
    );
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: "You can only create payment sessions for your own trips",
    });
  }

  // Verify trip status
  if (trip.status !== "awaiting_payment") {
    console.log(
      `[PAYMENT_DEBUG] Trip ${tripId} has invalid status: ${trip.status}`
    );
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: `Cannot create payment session. Trip status is ${trip.status}. Expected awaiting_payment.`,
    });
  }

  // Verify payment status
  if (trip.paymentStatus === "paid") {
    console.log(`[PAYMENT_DEBUG] Trip ${tripId} is already paid`);
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Trip is already paid",
    });
  }

  if (!["pending", "unpaid"].includes(trip.paymentStatus)) {
    console.log(
      `[PAYMENT_DEBUG] Trip ${tripId} has invalid payment status: ${trip.paymentStatus}`
    );
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: `Cannot create payment session. Payment status is ${trip.paymentStatus}.`,
    });
  }

  // Always create a fresh session - sessions are ephemeral and single-use
  console.log(
    `[PAYMENT_DEBUG] Creating fresh checkout session for trip ${tripId}`
  );

  // Validate and calculate amount server-side (NEVER trust client)
  const negotiatedPrice = Number(trip.negotiatedPrice);
  if (!negotiatedPrice || negotiatedPrice <= 0) {
    console.log(
      `[PAYMENT_DEBUG] Invalid negotiated price for trip ${tripId}: ${trip.negotiatedPrice}`
    );
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: "Trip does not have a valid negotiated price",
    });
  }

  // Convert to minor currency units (cents for USD/EUR, etc.)
  const amount = Math.round(negotiatedPrice * 100);
  const currency = trip.currency || process.env.CURRENCY || "usd";

  console.log(
    `[PAYMENT_DEBUG] Creating Stripe session: amount=${amount} ${currency}, tripId=${tripId}`
  );

  try {
    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Tour Guide Service - Trip ${tripId.substring(0, 8)}`,
              description: `Guided tour starting ${new Date(
                trip.startAt
              ).toLocaleDateString()}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        tripId: trip._id.toString(),
        touristId: trip.tourist._id.toString(),
        guideId: trip.selectedGuide?._id?.toString() || "",
      },
success_url: process.env.STRIPE_SUCCESS_URL
  .replace("{tripId}", tripId)
  .replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}"),
      cancel_url: (
        process.env.STRIPE_CANCEL_URL ||
        `${process.env.FRONTEND_URL}/trips/{tripId}/payment/cancel`
      ).replace("{tripId}", tripId),
      customer_email: trip.tourist.email,
    });

    console.log(
      `[PAYMENT_DEBUG] Stripe session created: ${session.id}, url: ${session.url}`
    );
    console.log(
      `[PAYMENT_DEBUG] Session metadata: tripId=${trip._id.toString()}, touristId=${trip.tourist._id.toString()}, guideId=${
        trip.selectedGuide?._id?.toString() || "none"
      }`
    );

    // DO NOT save session ID or change paymentStatus - session is ephemeral
    // Webhook will handle payment confirmation using metadata

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Checkout session created successfully",
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error) {
    console.error(
      `[PAYMENT_DEBUG] Error creating Stripe session for trip ${tripId}:`,
      error
    );
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to create payment session",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * POST /webhook/stripe
 * Handle Stripe webhook events (payment confirmation)
 *
 * Security:
 * - Verifies webhook signature using STRIPE_WEBHOOK_SECRET
 * - Idempotent: safe to call multiple times
 *
 * Events handled:
 * - checkout.session.completed: Payment successful, confirm trip
 *
 * NOTE: This handler does NOT use asyncHandler to ensure immediate response
 */
export const stripeWebhookHandler = async (req, res) => {
  // Log IMMEDIATELY on every webhook request
  console.log("[STRIPE_WEBHOOK_HIT]");
  console.log(
    `[STRIPE_WEBHOOK] Received webhook at ${new Date().toISOString()}`
  );
  console.log(`[STRIPE_WEBHOOK] Request headers:`, req.headers);

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[PAYMENT_DEBUG] STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Webhook secret not configured",
    });
  }

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(
      `[PAYMENT_DEBUG] Webhook received: ${event.type}, id: ${event.id}`
    );
    console.log(`[PAYMENT_DEBUG] Event type: ${event.type}`);
  } catch (err) {
    console.error(
      `[PAYMENT_DEBUG] Webhook signature verification failed:`,
      err.message
    );
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: `Webhook signature verification failed: ${err.message}`,
    });
  }

  // Handle checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { tripId, touristId, guideId } = session.metadata;

    console.log(
      `[PAYMENT_DEBUG] Processing checkout.session.completed for trip ${tripId}`
    );
    console.log(`[PAYMENT_DEBUG] Session metadata:`, session.metadata);
    console.log(
      `[PAYMENT_DEBUG] Session ID: ${session.id}, Payment Intent: ${session.payment_intent}`
    );

    // CRITICAL: Always return 200 to Stripe, even if processing fails
    // This prevents Stripe from retrying and acknowledges receipt
    if (!tripId) {
      console.error(
        "[PAYMENT_DEBUG] No tripId in session metadata - cannot process payment"
      );
      console.error("[PAYMENT_DEBUG] Session metadata:", session.metadata);
      // Return 200 to acknowledge receipt, but don't process
      return res.status(HTTP_STATUS.OK).json({
        received: true,
        message: "Webhook received but tripId missing in metadata",
      });
    }

    try {
      // Load trip
      const trip = await Trip.findById(tripId);
      if (!trip) {
        console.error(
          `[PAYMENT_DEBUG] Trip ${tripId} not found in database - cannot process payment`
        );
        // Return 200 to acknowledge receipt
        return res.status(HTTP_STATUS.OK).json({
          received: true,
          message: "Webhook received but trip not found",
        });
      }

      // Idempotency check: if already paid, skip update
      if (trip.paymentStatus === "paid") {
        console.log(
          `[PAYMENT_DEBUG] Trip ${tripId} is already marked as paid (idempotent webhook)`
        );
        return res.status(HTTP_STATUS.OK).json({
          success: true,
          message: "Payment already processed",
        });
      }

      // Validate state transition
      try {
        validateTransition(trip.status, TRIP_STATES.CONFIRMED);
      } catch (validationError) {
        console.error(
          `[PAYMENT_DEBUG] Invalid state transition for trip ${tripId}: ${trip.status} -> confirmed`,
          validationError.message
        );
        // Return 200 to acknowledge receipt, but don't process
        return res.status(HTTP_STATUS.OK).json({
          received: true,
          message: "Webhook received but trip state transition invalid",
        });
      }

      // Atomic Update with timestamp
      const updateResult = await Trip.updateOne(
        { _id: tripId, status: trip.status },
        {
          status: TRIP_STATES.CONFIRMED,
          paymentStatus: "paid",
          stripePaymentIntentId: session.payment_intent,
          confirmedAt: new Date(),
        }
      );

      if (updateResult.modifiedCount === 0) {
        console.warn(
          `[PAYMENT] Trip ${tripId} status changed during payment processing (race condition)`
        );
        // Return 200 to acknowledge receipt
        return res.status(HTTP_STATUS.OK).json({
          received: true,
          message: "Webhook received but trip already updated",
        });
      }

      console.log(
        `[PAYMENT_DEBUG] Trip ${tripId} confirmed. Payment Intent: ${session.payment_intent}`
      );

      // Fetch updated trip and emit status change (NON-BLOCKING)
      const updatedTrip = await Trip.findById(tripId)
        .populate("tourist", "name email")
        .populate("selectedGuide", "name user");

      if (updatedTrip) {
        console.log(`[PAYMENT_DEBUG] Emitting socket event for trip ${tripId}`);
        emitTripStatusUpdate(updatedTrip);
      } else {
        console.warn(
          `[PAYMENT_DEBUG] Could not fetch updated trip ${tripId} for socket emission`
        );
      }

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Payment processed successfully",
      });
    } catch (error) {
      // CRITICAL: Log error but ALWAYS return 200 to Stripe
      console.error(
        `[PAYMENT_DEBUG] Error processing payment for trip ${tripId}:`,
        error
      );
      console.error("[PAYMENT_DEBUG] Error stack:", error.stack);
      // Return 200 to acknowledge receipt, even though processing failed
      return res.status(HTTP_STATUS.OK).json({
        received: true,
        message: "Webhook received but processing failed",
      });
    }
  }

  // Handle payment_intent.succeeded event (optional, additional confirmation)
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    console.log(
      `[PAYMENT_DEBUG] Payment intent succeeded: ${paymentIntent.id}`
    );
    // Additional logging or processing if needed
  }

  // Return 200 for all events (even unhandled ones) to acknowledge receipt
  return res.status(HTTP_STATUS.OK).json({ received: true });
};
