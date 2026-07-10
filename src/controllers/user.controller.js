const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService } = require('../services');

/**
 * POST /v1/users
 * Admin only — create a new user or admin.
 */
const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body, req.user.id);
  res.status(httpStatus.CREATED).send(user);
});

/**
 * GET /v1/users
 * Admin only — paginated list with filters.
 */
const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'phoneNumber', 'role', 'isActive']);

  // Exclude the requesting user from the list
  filter._id = { $ne: req.user.id };

  // Support filtering by a single company membership
  if (req.query.company) {
    filter.companies = req.query.company;
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

/**
 * GET /v1/users/:userId
 * Admin can get any user; a logged-in user can get their own profile.
 */
const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send(user);
});

/**
 * PATCH /v1/users/:userId
 * Admin only — update user fields.
 */
const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body, req.user.id);
  res.send(user);
});

/**
 * DELETE /v1/users/:userId
 * Admin only — soft delete (sets isActive=false, deletedAt=now).
 */
const deleteUser = catchAsync(async (req, res) => {
  await userService.softDeleteUserById(req.params.userId, req.user.id);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
};
