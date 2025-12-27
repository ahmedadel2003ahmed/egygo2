import RefreshToken from '../models/RefreshToken.js';

/**
 * RefreshToken Repository - Direct Mongoose queries
 */
class RefreshTokenRepository {
  async create(tokenData) {
    return await RefreshToken.create(tokenData);
  }

  async findByToken(token) {
    return await RefreshToken.findOne({ token, isRevoked: false });
  }

  async findByUser(userId) {
    return await RefreshToken.find({ user: userId, isRevoked: false });
  }

  async revokeToken(token) {
    return await RefreshToken.findOneAndUpdate(
      { token },
      { isRevoked: true },
      { new: true }
    );
  }

  async revokeAllUserTokens(userId) {
    return await RefreshToken.updateMany(
      { user: userId, isRevoked: false },
      { isRevoked: true }
    );
  }

  async deleteExpired() {
    return await RefreshToken.deleteMany({
      expiresAt: { $lt: new Date() },
    });
  }

  async deleteByToken(token) {
    return await RefreshToken.deleteOne({ token });
  }
}

export default new RefreshTokenRepository();
