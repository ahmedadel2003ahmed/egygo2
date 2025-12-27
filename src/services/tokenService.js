import jwt from 'jsonwebtoken';
import refreshTokenRepository from '../repositories/refreshTokenRepository.js';
import { ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Token Service - Business logic for JWT and refresh tokens
 */
class TokenService {
  /**
   * Generate access token
   */
  generateAccessToken(userId, role) {
    return jwt.sign(
      { userId, role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '15m' }
    );
  }

  /**
   * Generate refresh token and store in database
   */
  async generateRefreshToken(userId, userAgent, ipAddress) {
    const token = jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES || '7d' }
    );

    // Calculate expiry date
    const expiresAt = new Date();
    const expiresInDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES?.replace('d', '') || '7');
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Store in database
    await refreshTokenRepository.create({
      user: userId,
      token,
      expiresAt,
      userAgent,
      ipAddress,
    });

    return token;
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error(ERROR_MESSAGES.TOKEN_EXPIRED);
      }
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if token exists in database and is not revoked
      const tokenRecord = await refreshTokenRepository.findByToken(token);
      
      if (!tokenRecord) {
        throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error(ERROR_MESSAGES.TOKEN_EXPIRED);
      }
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(token) {
    return await refreshTokenRepository.revokeToken(token);
  }

  /**
   * Revoke all user tokens (on password change, etc.)
   */
  async revokeAllUserTokens(userId) {
    return await refreshTokenRepository.revokeAllUserTokens(userId);
  }

  /**
   * Rotate refresh token
   */
  async rotateRefreshToken(oldToken, userId, userAgent, ipAddress) {
    // Revoke old token
    await this.revokeRefreshToken(oldToken);

    // Generate new token
    return await this.generateRefreshToken(userId, userAgent, ipAddress);
  }
}

export default new TokenService();
