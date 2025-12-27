import CallSession from '../models/CallSession.js';

class CallRepository {
  /**
   * Create new call session
   */
  async createCallSession(sessionData) {
    const session = new CallSession(sessionData);
    return await session.save();
  }

  /**
   * Find call session by ID
   */
  async findById(callId) {
    return await CallSession.findById(callId)
      .populate('touristUser', 'name email')
      .populate('guideUser', 'name email')
      .populate('tripId');
  }

  /**
   * Update call session
   */
  async updateCallSession(callId, updates) {
    return await CallSession.findByIdAndUpdate(callId, updates, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Find active sessions by user
   */
  async findActiveByUser(userId) {
    return await CallSession.find({
      $or: [{ touristUser: userId }, { guideUser: userId }],
      status: { $in: ['ringing', 'ongoing'] },
    })
      .populate('touristUser', 'name email avatar')
      .populate('guideUser', 'name email avatar')
      .populate('tripId')
      .sort({ startedAt: -1 });
  }

  /**
   * Find incoming calls for guide
   */
  async findIncomingCalls(guideId) {
    return await CallSession.find({
      guideUser: guideId,
      status: 'ringing'
    })
      .populate('touristUser', 'name email avatar')
      .populate('tripId', 'meetingAddress startAt status')
      .sort({ startedAt: -1 });
  }

  /**
   * Find sessions by trip
   */
  async findByTripId(tripId) {
    return await CallSession.find({ tripId })
      .populate('touristUser', 'name email')
      .populate('guideUser', 'name email')
      .sort({ startedAt: -1 });
  }

  /**
   * Check if user is participant in call session
   */
  async isParticipant(callId, userId) {
    const session = await CallSession.findById(callId);
    if (!session) return false;

    return (
      session.touristUser.toString() === userId.toString() ||
      session.guideUser.toString() === userId.toString()
    );
  }
}

export default new CallRepository();
