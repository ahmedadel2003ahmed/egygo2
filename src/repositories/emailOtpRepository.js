import EmailOTP from '../models/EmailOTP.js';

/**
 * EmailOTP Repository - Direct Mongoose queries
 */
class EmailOtpRepository {
  async create(otpData) {
    return await EmailOTP.create(otpData);
  }

  async findLatestByEmail(email) {
    return await EmailOTP.findOne({
      email: email.toLowerCase(),
      expiresAt: { $gt: new Date() },
      isUsed: false,
    }).sort({ createdAt: -1 });
  }

  async incrementAttempts(otpId) {
    return await EmailOTP.findByIdAndUpdate(
      otpId,
      { $inc: { attempts: 1 } },
      { new: true }
    );
  }

  async markAsUsed(otpId) {
    return await EmailOTP.findByIdAndUpdate(
      otpId,
      { isUsed: true },
      { new: true }
    );
  }

  async deleteByEmail(email) {
    return await EmailOTP.deleteMany({ email: email.toLowerCase() });
  }

  async deleteExpired() {
    return await EmailOTP.deleteMany({
      expiresAt: { $lt: new Date() },
    });
  }
}

export default new EmailOtpRepository();
