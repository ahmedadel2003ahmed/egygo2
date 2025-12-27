import { sendAdminNotification } from "../utils/mailer.js";
import admin from "../config/firebase.js";

/**
 * Notification Service - Business logic for notifications
 */
class NotificationService {
  /**
   * Get admin emails from environment
   */
  getAdminEmails() {
    const emails = process.env.ADMIN_EMAILS || "";
    return emails
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }

  /**
   * Notify admins about new guide application
   */
  async notifyAdminNewGuideApplication(guide, user) {
    const adminEmails = this.getAdminEmails();

    if (adminEmails.length === 0) {
      console.log("No admin emails configured");
      return;
    }

    const subject = "New Guide Application - LocalGuide";
    const message = `A new guide application has been submitted by ${user.name} (${user.email})`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Guide Application</h2>
        <p>A new guide application has been submitted and requires your review.</p>
        <h3>Guide Details:</h3>
        <ul>
          <li><strong>Name:</strong> ${user.name}</li>
          <li><strong>Email:</strong> ${user.email}</li>
          <li><strong>Phone:</strong> ${user.phone || "N/A"}</li>
          <li><strong>Languages:</strong> ${guide.languages.join(", ")}</li>
          <li><strong>Price per Hour:</strong> $${guide.pricePerHour}</li>
          <li><strong>Licensed:</strong> ${guide.isLicensed ? "Yes" : "No"}</li>
        </ul>
        <p><a href="${process.env.FRONTEND_URL}/admin/guides/${
      guide._id
    }">Review Application</a></p>
      </div>
    `;

    try {
      await sendAdminNotification(adminEmails, subject, message, html);
      console.log("Admin notification sent for new guide application");
    } catch (error) {
      console.error("Failed to send admin notification:", error);
    }
  }

  /**
   * Notify admins about document upload (especially tourism card)
   */
  async notifyAdminDocumentUploaded(guide, user, document) {
    const adminEmails = this.getAdminEmails();

    if (adminEmails.length === 0) {
      console.log("No admin emails configured");
      return;
    }

    const subject = `New Document Upload - ${document.type} - LocalGuide`;
    const message = `${user.name} uploaded a new document: ${document.type}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Document Uploaded</h2>
        <p>${
          user.name
        } has uploaded a new document that requires verification.</p>
        <h3>Details:</h3>
        <ul>
          <li><strong>Guide:</strong> ${user.name} (${user.email})</li>
          <li><strong>Document Type:</strong> ${document.type
            .replace("_", " ")
            .toUpperCase()}</li>
          <li><strong>Upload Date:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p><img src="${
          document.url
        }" alt="Document" style="max-width: 400px; margin: 20px 0;" /></p>
        <p><a href="${process.env.FRONTEND_URL}/admin/guides/${
      guide._id
    }/documents">Review Document</a></p>
      </div>
    `;

    try {
      await sendAdminNotification(adminEmails, subject, message, html);
      console.log("Admin notification sent for document upload");
    } catch (error) {
      console.error("Failed to send admin notification:", error);
    }
  }

  /**
   * Notify guide about document approval/rejection
   */
  async notifyGuideDocumentStatus(user, document, status, note) {
    console.log(
      `Document ${document.type} for guide ${user.email} is ${status}`
    );
  }

  /**
   * Notify guide about new trip request
   */
  async notifyGuideNewTripRequest(guide, trip, tourist) {
    console.log(
      `New trip request for guide ${guide.user.email} from tourist ${tourist.email}`
    );
  }

  /**
   * Notify tourist about trip status change
   */
  async notifyTouristTripStatusChange(tourist, trip, newStatus) {
    console.log(
      `Trip status changed to ${newStatus} for tourist ${tourist.email}`
    );
  }

  /**
   * Notify guide about incoming call
   */
  async notifyGuideCall(guideUserId, touristUserId, callId) {
    console.log(
      `Incoming call for guide ${guideUserId} from tourist ${touristUserId}`
    );
    console.log(`Call session ID: ${callId}`);
  }

  /**
   * Notify guide that they were selected for a trip
   */
  async notifyGuideSelected(guide, trip) {
    console.log(`Guide ${guide._id} selected for trip ${trip._id}`);
    await this._sendPushNotification(
      guide.user,
      "You've been selected for a trip!",
      `A tourist has selected you as their guide.`,
      { notificationId: trip._id, type: "guide_selected" }
    );
  }

  /**
   * Notify guide that trip is pending confirmation (after call)
   */
  async notifyGuideTripPendingConfirmation(guide, trip) {
    console.log(`Trip ${trip._id} pending confirmation for guide ${guide._id}`);
    await this._sendPushNotification(
      trip.selectedGuide.user,
      "Trip Pending Confirmation",
      "Please review and confirm the trip details.",
      { notificationId: trip._id, type: "trip_pending_confirmation" }
    );
  }

  /**
   * Notify tourist that trip has been accepted
   */
  async notifyTouristTripAccepted(tripId) {
    console.log(`Trip ${tripId} accepted by guide. Notifying tourist...`);
  }

  /**
   * Notify guide about new trip (alias for notifyGuideNewTripRequest)
   */
  async notifyGuideNewTrip(guide, trip, tourist) {
    return this.notifyGuideNewTripRequest(guide, trip, tourist);
  }

  /**
   * Notify tourist that trip has been confirmed by guide
   */
  async notifyTouristTripConfirmed(tourist, trip) {
    console.log(
      `Trip ${trip._id} confirmed by guide. Notifying tourist ${tourist.email}...`
    );
  }

  /**
   * Notify tourist that trip is awaiting payment
   */
  async notifyTouristTripAwaitingPayment(tourist, trip) {
    console.log(
      `Trip ${trip._id} accepted by guide. Awaiting payment from tourist ${tourist.email}...`
    );
    await this._sendPushNotification(
      tourist._id,
      "Payment Required",
      "Your trip has been accepted! Please complete payment.",
      { notificationId: trip._id, type: "trip_awaiting_payment" }
    );
  }

  /**
   * Notify tourist that trip has been rejected
   */
  async notifyTouristTripRejected(tourist, trip, reason) {
    console.log(
      `Trip ${trip._id} rejected by guide. Notifying tourist ${tourist.email}...`
    );
    await this._sendPushNotification(
      tourist._id,
      "Trip Declined",
      reason || "The guide has declined your trip request.",
      { notificationId: trip._id, type: "trip_rejected" }
    );
  }

  /**
   * Notify tourist about proposal
   */
  async notifyTouristProposal(tripId, touristId) {
    console.log(`Notifying tourist ${touristId} about proposal for trip ${tripId}...`);
  }

  /**
   * Notify guide about proposal acceptance
   */
  async notifyGuideProposalAccepted(tripId, guideId) {
    console.log(`Notifying guide ${guideId} about proposal acceptance for trip ${tripId}...`);
  }

  /**
   * Notify guide about proposal rejection
   */
  async notifyGuideProposalRejected(tripId, guideId) {
    console.log(`Notifying guide ${guideId} about proposal rejection for trip ${tripId}...`);
  }

  /**
   * Send Firebase push notification
   * @private
   */
  async _sendPushNotification(userId, title, body, data) {
    try {
      const User = (await import("../models/User.js")).default;
      const user = await User.findById(userId);
      
      if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
        console.log(`No FCM tokens found for user ${userId}`);
        return;
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: {
          notificationId: data.notificationId?.toString() || "",
          type: data.type || "",
        },
        tokens: user.fcmTokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Firebase push sent: ${response.successCount} success, ${response.failureCount} failures`);

      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(user.fcmTokens[idx]);
            console.error(`Failed to send to token ${user.fcmTokens[idx]}:`, resp.error);
          }
        });

        if (failedTokens.length > 0) {
          user.fcmTokens = user.fcmTokens.filter(token => !failedTokens.includes(token));
          await user.save();
        }
      }
    } catch (error) {
      console.error("Firebase push notification error:", error);
    }
  }
}

export default new NotificationService();
