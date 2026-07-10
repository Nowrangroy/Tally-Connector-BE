const Joi = require('joi');

const logout = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const refreshTokens = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const phoneNumber = Joi.string()
  .trim()
  .pattern(/^\+?[0-9\s\-().]{7,20}$/)
  .messages({
    'string.pattern.base': '"phoneNumber" must be a valid phone number',
  });

const sendOtp = {
  body: Joi.object().keys({
    phoneNumber: phoneNumber.required(),
  }),
};

const verifyOtp = {
  body: Joi.object().keys({
    phoneNumber: phoneNumber.required(),
    code: Joi.string().min(4).max(10).required(),
  }),
};

module.exports = {
  logout,
  refreshTokens,
  sendOtp,
  verifyOtp,
};
