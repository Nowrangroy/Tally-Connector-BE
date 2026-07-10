const httpStatus = require('http-status');
const twilio = require('twilio');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

// Lazily initialise client so tests can run without real Twilio credentials
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!config.twilio.accountSid || !config.twilio.authToken) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'OTP service is not configured');
    }
    _client = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return _client;
};

/**
 * Send an OTP to the given phone number via Twilio Verify.
 * @param {string} phoneNumber - E.164 formatted phone number
 * @returns {Promise<void>}
 */
const sendOtp = async (phoneNumber) => {
  try {
    const client = getClient();
    await client.verify.v2.services(config.twilio.verifyServiceSid).verifications.create({
      to: phoneNumber,
      channel: config.twilio.otpChannel || 'sms',
    });
  } catch (err) {
    // Log internally but never expose Twilio internals to the client
    logger.error(`Twilio sendOtp error for ${phoneNumber}: ${err.message}`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send OTP. Please try again.');
  }
};

/**
 * Verify an OTP code for the given phone number via Twilio Verify.
 * @param {string} phoneNumber - E.164 formatted phone number
 * @param {string} code - OTP code entered by the user
 * @returns {Promise<boolean>} true if approved
 * @throws {ApiError} 401 if the code is invalid/expired
 */
const verifyOtp = async (phoneNumber, code) => {
  try {
    const client = getClient();
    const check = await client.verify.v2.services(config.twilio.verifyServiceSid).verificationChecks.create({
      to: phoneNumber,
      code,
    });
    if (check.status !== 'approved') {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired OTP');
    }
    return true;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Generic failure — don't leak Twilio details
    logger.error(`Twilio verifyOtp error for ${phoneNumber}: ${err.message}`);
    throw new ApiError(httpStatus.UNAUTHORIZED, 'OTP verification failed');
  }
};

/**
 * Generate verify email token (re-added to support email flow)
 */
module.exports = {
  sendOtp,
  verifyOtp,
};
