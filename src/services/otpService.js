import emailOtpRepository from '../repositories/emailOtpRepository.js';
import { generateOTP } from '../utils/otpGenerator.js';
import { hash, compare } from '../utils/hashUtil.js';
import { ERROR_MESSAGES } from '../utils/constants.js';

/**
 * OTP Service - Business logic for OTP operations
 */
class OtpService {
  /**
   * Generate and store OTP for email
   */
  async generateAndStoreOTP(email) {
    // Delete any existing OTPs for this email
    await emailOtpRepository.deleteByEmail(email);

    // Generate new OTP
    const otp = generateOTP();
    const otpHash = await hash(otp);

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + parseInt(process.env.OTP_EXPIRES_MINUTES || '10'));

    // Store hashed OTP
    await emailOtpRepository.create({
      email: email.toLowerCase(),
      otpHash,
      expiresAt,
    });

    return otp; // Return plain OTP to send via email
  }

  /**
   * Verify OTP
   */
  async verifyOTP(email, otp) {
    const otpRecord = await emailOtpRepository.findLatestByEmail(email);

    if (!otpRecord) {
      throw new Error(ERROR_MESSAGES.INVALID_OTP);
    }

    // Check if max attempts exceeded
    if (otpRecord.attempts >= 5) {
      throw new Error(ERROR_MESSAGES.MAX_OTP_ATTEMPTS);
    }

    // Increment attempts
    await emailOtpRepository.incrementAttempts(otpRecord._id);

    // Verify OTP
    const isValid = await compare(otp, otpRecord.otpHash);

    if (!isValid) {
      throw new Error(ERROR_MESSAGES.INVALID_OTP);
    }

    // Mark as used
    await emailOtpRepository.markAsUsed(otpRecord._id);

    return true;
  }

  /**
   * Resend OTP
   */
  async resendOTP(email) {
    return await this.generateAndStoreOTP(email);
  }
}

export default new OtpService();
