import userRepository from '../repositories/userRepository.js';
import otpService from './otpService.js';
import tokenService from './tokenService.js';
import emailService from './emailService.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, AUDIT_ACTIONS } from '../utils/constants.js';
import { hash } from '../utils/hashUtil.js';
import { logAudit } from '../utils/auditLogger.js';

/**
 * Auth Service - Business logic for authentication operations
 */
class AuthService {
  /**
   * Register a new user
   */
  async register(userData, ipAddress, userAgent) {
    const { email, password, name, phone, role } = userData;

    // Check if email already exists
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    // Create user
    const user = await userRepository.create({
      email,
      password, // Will be hashed by User model pre-save hook
      name,
      phone,
      role: role || 'tourist',
      isEmailVerified: false,
    });

    // Generate and send OTP (non-blocking - allow registration even if email fails)
    const otp = await otpService.generateAndStoreOTP(email);

    // Send email asynchronously without blocking registration
    emailService.sendOTP(email, otp).catch(err => {
      console.error('Failed to send OTP email (non-blocking):', err.message);
      // Log but don't fail registration
    });

    console.log(`\n🔐 OTP for ${email}: ${otp} (expires in ${process.env.OTP_EXPIRES_MINUTES || 10} minutes)\n`);

    return {
      message: SUCCESS_MESSAGES.REGISTRATION_SUCCESS + ' (Check console for OTP if email fails)',
      userId: user._id,
      otp: process.env.NODE_ENV === 'development' ? otp : undefined, // Include OTP in dev mode
    };
  }

  /**
   * Verify email with OTP
   */
  async verifyEmail(email, otp) {
    // Verify OTP
    await otpService.verifyOTP(email, otp);

    // Find user and mark email as verified
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    await userRepository.markEmailAsVerified(user._id);

    // Send welcome email
    await emailService.sendWelcome(email, user.name);

    return {
      message: SUCCESS_MESSAGES.EMAIL_VERIFIED,
    };
  }

  /**
   * Resend OTP
   */
  async resendOTP(email) {
    // Check if user exists
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Generate and send new OTP
    const otp = await otpService.resendOTP(email);

    // Send email asynchronously without blocking
    emailService.sendOTP(email, otp).catch(err => {
      console.error('Failed to send OTP email (non-blocking):', err.message);
    });

    console.log(`\n🔐 OTP for ${email}: ${otp} (expires in ${process.env.OTP_EXPIRES_MINUTES || 10} minutes)\n`);

    return {
      message: SUCCESS_MESSAGES.OTP_SENT + ' (Check console for OTP if email fails)',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  /**
   * Login user
   */
  async login(email, password, ipAddress, userAgent) {
    try {
      // Find user
      const user = await userRepository.findByEmail(email);
      if (!user) {
        throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

   

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      // Generate tokens
      const accessToken = tokenService.generateAccessToken(user._id, user.role);
      const refreshToken = await tokenService.generateRefreshToken(user._id, userAgent, ipAddress);

      // Update last login
      await userRepository.updateLastLogin(user._id);

      // Log audit
      await logAudit({
        userId: user._id,
        action: AUDIT_ACTIONS.LOGIN,
        resourceType: 'user',
        resourceId: user._id,
        ipAddress,
        userAgent,
      });

      return {
        message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
        user,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      console.error('[AuthService] Login error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken, ipAddress, userAgent) {
    // Verify refresh token
    const decoded = await tokenService.verifyRefreshToken(refreshToken);

    // Get user
    const user = await userRepository.findById(decoded.userId);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Generate new access token
    const accessToken = tokenService.generateAccessToken(user._id, user.role);

    // Optionally rotate refresh token
    const newRefreshToken = await tokenService.rotateRefreshToken(
      refreshToken,
      user._id,
      userAgent,
      ipAddress
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout user
   */
  async logout(refreshToken, userId, ipAddress, userAgent) {
    // Revoke refresh token
    if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken);
    }

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.LOGOUT,
      resourceType: 'user',
      resourceId: userId,
      ipAddress,
      userAgent,
    });

    return {
      message: SUCCESS_MESSAGES.LOGOUT_SUCCESS,
    };
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword, ipAddress, userAgent) {
    // Get user
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    // Hash new password
    const hashedPassword = await hash(newPassword);

    // Update password
    await userRepository.updatePassword(userId, hashedPassword);

    // Revoke all refresh tokens
    await tokenService.revokeAllUserTokens(userId);

    // Log audit
    await logAudit({
      userId,
      action: AUDIT_ACTIONS.PASSWORD_CHANGE,
      resourceType: 'user',
      resourceId: userId,
      ipAddress,
      userAgent,
    });

    return {
      message: SUCCESS_MESSAGES.PASSWORD_CHANGED,
    };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    return user;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updateData) {
    const user = await userRepository.findByIdAndUpdate(userId, updateData);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    return user;
  }
}

export default new AuthService();
