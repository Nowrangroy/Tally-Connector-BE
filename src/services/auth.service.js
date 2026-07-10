const httpStatus = require('http-status');
const tokenService = require('./token.service');
const userService = require('./user.service');
const twilioService = require('./twilio.service');
const Token = require('../models/token.model');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const { normalizePhoneNumber } = require('../utils/phone');

/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  if (!user || !user.isActive || user.deletedAt) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  if (!(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  return user;
};

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

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(resetPasswordToken, tokenTypes.RESET_PASSWORD);
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await userService.updateUserById(user.id, { password: newPassword });
    await Token.deleteMany({ user: user.id, type: tokenTypes.RESET_PASSWORD });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise}
 */
const verifyEmail = async (verifyEmailToken) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyToken(verifyEmailToken, tokenTypes.VERIFY_EMAIL);
    const user = await userService.getUserById(verifyEmailTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await Token.deleteMany({ user: user.id, type: tokenTypes.VERIFY_EMAIL });
    await userService.updateUserById(user.id, { isEmailVerified: true });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Email verification failed');
  }
};

module.exports = {
  loginUserWithEmailAndPassword,
  sendOtp,
  verifyOtp,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
};
