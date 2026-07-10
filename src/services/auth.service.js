const httpStatus = require('http-status');
const tokenService = require('./token.service');
const userService = require('./user.service');
const twilioService = require('./twilio.service');
const Token = require('../models/token.model');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const { normalizePhoneNumber } = require('../utils/phone');

/**
 * Send OTP to phone number
 * @param {string} rawPhoneNumber
 * @returns {Promise<void>}
 */
const sendOtp = async (rawPhoneNumber) => {
  const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
  const user = await userService.getUserByPhoneNumber(phoneNumber);

  // Use a generic message to prevent user enumeration
  if (!user || !user.isActive || user.deletedAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'If this number is registered, you will receive an OTP.');
  }

  await twilioService.sendOtp(phoneNumber);
};

/**
 * Verify OTP and return the authenticated user
 * @param {string} rawPhoneNumber
 * @param {string} code
 * @returns {Promise<User>}
 */
const verifyOtp = async (rawPhoneNumber, code) => {
  const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
  const user = await userService.getUserByPhoneNumber(phoneNumber);

  if (!user || !user.isActive || user.deletedAt) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'OTP verification failed');
  }

  // Throws 401 if code is wrong/expired
  await twilioService.verifyOtp(phoneNumber, code);

  // Update verification status and last login
  user.isPhoneVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  return user;
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({ token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.remove();
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const user = await userService.getUserById(refreshTokenDoc.user);
    if (!user || !user.isActive || user.deletedAt) {
      throw new Error();
    }
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  logout,
  refreshAuth,
};
