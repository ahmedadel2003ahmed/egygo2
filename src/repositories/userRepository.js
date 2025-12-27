import User from '../models/User.js';

/**
 * User Repository - Direct Mongoose queries
 */
class UserRepository {
  async create(userData) {
    return await User.create(userData);
  }

  async findById(userId) {
    return await User.findById(userId);
  }

  async findByEmail(email) {
    return await User.findOne({ email: email.toLowerCase() });
  }

  async findByIdAndUpdate(userId, updateData) {
    return await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });
  }

  async updatePassword(userId, hashedPassword) {
    const user = await User.findById(userId);
    if (!user) return null;
    
    user.password = hashedPassword;
    await user.save();
    return user;
  }

  async markEmailAsVerified(userId) {
    return await User.findByIdAndUpdate(
      userId,
      { isEmailVerified: true },
      { new: true }
    );
  }

  async updateLastLogin(userId) {
    return await User.findByIdAndUpdate(userId, { lastLogin: new Date() });
  }

  async findAll(filter = {}) {
    return await User.find(filter);
  }

  async existsByEmail(email) {
    const count = await User.countDocuments({ email: email.toLowerCase() });
    return count > 0;
  }
}

export default new UserRepository();
