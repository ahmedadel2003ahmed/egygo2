import rateLimit from "express-rate-limit";
import { HTTP_STATUS } from "../utils/constants.js";

/**
 * General rate limiter - 500 requests per 15 minutes (increased for development)
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Auth rate limiter - 5 requests per 15 minutes for login/register
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later",
  },
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
  skipSuccessfulRequests: true,
});

/**
 * OTP rate limiter - 3 requests per 10 minutes
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many OTP requests, please try again later",
  },
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
});

/**
 * Password reset limiter - 3 requests per hour
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many password reset requests, please try again later",
  },
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
});
