const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, tokenService } = require('../services');

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const sendOtp = catchAsync(async (req, res) => {
  await authService.sendOtp(req.body.phoneNumber);
  res.status(httpStatus.OK).send({ message: 'OTP sent successfully' });
});

const verifyOtp = catchAsync(async (req, res) => {
  const { phoneNumber, code } = req.body;
  const user = await authService.verifyOtp(phoneNumber, code);
  const tokens = await tokenService.generateAuthTokens(user);
  res.send({ user, tokens });
});

module.exports = {
  logout,
  refreshTokens,
  sendOtp,
  verifyOtp,
};
