import AuditLog from '../models/AuditLog.js';

/**
 * AuditLog Repository - Direct Mongoose queries
 */
class AuditLogRepository {
  async create(logData) {
    return await AuditLog.create(logData);
  }

  async findByUser(userId, options = {}) {
    const { skip = 0, limit = 50, sort = { timestamp: -1 } } = options;
    
    return await AuditLog.find({ user: userId })
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  async findByAction(action, options = {}) {
    const { skip = 0, limit = 50, sort = { timestamp: -1 } } = options;
    
    return await AuditLog.find({ action })
      .populate('user', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  async findAll(filter = {}, options = {}) {
    const { skip = 0, limit = 50, sort = { timestamp: -1 } } = options;
    
    return await AuditLog.find(filter)
      .populate('user', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  async countDocuments(filter = {}) {
    return await AuditLog.countDocuments(filter);
  }
}

export default new AuditLogRepository();
