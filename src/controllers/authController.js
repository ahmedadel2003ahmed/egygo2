import authService from '../services/authService.js';
import { HTTP_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getIpAddress, getUserAgent } from '../utils/auditLogger.js';

/**
 * Auth Controller - Handle authentication requests
 */

/**
 * Register new user
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await authService.register(req.body, ipAddress, userAgent);

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    ...result,
  });
});

/**
 * Verify email with OTP
 * POST /api/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const result = await authService.verifyEmail(email, otp);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result, // todo : delete this line
  });
});

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
export const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const result = await authService.resendOTP(email);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result, // todo : delete this line
  });
});

/**
 * Login user
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await authService.login(email, password, ipAddress, userAgent);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
    message: result.message,
  });
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await authService.refreshAccessToken(refreshToken, ipAddress, userAgent);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
});

/**
 * Logout user
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await authService.logout(refreshToken, req.userId, ipAddress, userAgent);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.userId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: user,
  });
});

/**
 * Change password
 * PUT /api/auth/change-password
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  const result = await authService.changePassword(
    req.userId,
    currentPassword,
    newPassword,
    ipAddress,
    userAgent
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    ...result,
  });
});
