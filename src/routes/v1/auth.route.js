const express = require('express');
const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/auth.validation');
const authController = require('../../controllers/auth.controller');
const { otpLimiter } = require('../../middlewares/rateLimiter');

const router = express.Router();

router.post('/send-otp', otpLimiter, validate(authValidation.sendOtp), authController.sendOtp);
router.post('/verify-otp', otpLimiter, validate(authValidation.verifyOtp), authController.verifyOtp);
router.post('/logout', validate(authValidation.logout), authController.logout);
router.post('/refresh-tokens', validate(authValidation.refreshTokens), authController.refreshTokens);

module.exports = router;
