import { sendOTPEmail, sendWelcomeEmail, sendPasswordResetEmail } from '../utils/mailer.js';

/**
 * Email Service - Business logic for email operations
 */
class EmailService {
  /**
   * Send OTP email
   */
  async sendOTP(email, otp) {
    try {
      await sendOTPEmail(email, otp);
      console.log(`OTP sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send OTP to ${email}:`, error);
      throw new Error('Failed to send OTP email');
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcome(email, name) {
    try {
      await sendWelcomeEmail(email, name);
      console.log(`Welcome email sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send welcome email to ${email}:`, error);
      // Don't throw - welcome email is not critical
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email, resetToken) {
    try {
      await sendPasswordResetEmail(email, resetToken);
      console.log(`Password reset email sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send password reset email to ${email}:`, error);
      throw new Error('Failed to send password reset email');
    }
  }
}

export default new EmailService();
