const httpStatus = require('http-status');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizePhoneNumber } = require('../utils/phone');

/**
 * Create a user (admin only or public registration)
 * @param {Object} userBody
 * @param {ObjectId} [createdById] - ID of the admin creating the user
 * @returns {Promise<User>}
 */
const createUser = async (userBody, createdById) => {
  if (userBody.email && (await User.isEmailTaken(userBody.email))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  let phoneNumber;
  if (userBody.phoneNumber) {
    phoneNumber = normalizePhoneNumber(userBody.phoneNumber);
    if (await User.isPhoneNumberTaken(phoneNumber)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Phone number already taken');
    }
  }

  // Remove duplicates and empty strings from companies
  const companies = [...new Set((userBody.companies || []).map((c) => c.trim()).filter(Boolean))];

  return User.create({
    name: userBody.name,
    email: userBody.email,
    password: userBody.password,
    phoneNumber,
    role: userBody.role || 'user',
    companies,
    createdBy: createdById,
  });
};

/**
 * Query for users with filters and pagination
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async (filter, options) => {
  const users = await User.paginate(filter, options);
  return users;
};

/**
 * Get user by id
 * @param {ObjectId} id
 * @returns {Promise<User>}
 */
const getUserById = async (id) => {
  return User.findById(id);
};

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User>}
 */
const getUserByEmail = async (email) => {
  return User.findOne({ email });
};

/**
 * Get user by phone number
 * @param {string} phoneNumber - E.164 formatted phone number
 * @returns {Promise<User>}
 */
const getUserByPhoneNumber = async (phoneNumber) => {
  return User.findOne({ phoneNumber });
};

/**
 * Update user by id (admin only or self-update)
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @param {ObjectId} [updatedById] - ID of the user performing the update
 * @returns {Promise<User>}
 */
const updateUserById = async (userId, updateBody, updatedById) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  if (updateBody.phoneNumber) {
    updateBody.phoneNumber = normalizePhoneNumber(updateBody.phoneNumber);
    if (await User.isPhoneNumberTaken(updateBody.phoneNumber, userId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Phone number already taken');
    }
  }

  // Guard: do not allow deactivating the last active admin
  if (updateBody.isActive === false || updateBody.role === 'user') {
    const isLastAdmin = await isLastActiveAdmin(userId);
    if (isLastAdmin && user.role === 'admin') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot deactivate or demote the last active admin');
    }
  }

  // Clean companies array if provided
  if (updateBody.companies) {
    updateBody.companies = [...new Set(updateBody.companies.map((c) => c.trim()).filter(Boolean))];
  }

  Object.assign(user, updateBody, { updatedBy: updatedById });
  await user.save();
  return user;
};

/**
 * Soft-delete user by id (sets isActive=false, deletedAt=now)
 * @param {ObjectId} userId
 * @param {ObjectId} deletedById - ID of the admin performing the delete
 * @returns {Promise<User>}
 */
const softDeleteUserById = async (userId, deletedById) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Guard: do not allow deleting the last active admin
  if (user.role === 'admin') {
    const isLastAdmin = await isLastActiveAdmin(userId);
    if (isLastAdmin) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete the last active admin');
    }
  }

  Object.assign(user, {
    isActive: false,
    deletedAt: new Date(),
    updatedBy: deletedById,
  });
  await user.save();
  return user;
};

/**
 * Check whether a given user is the only remaining active admin.
 * @param {ObjectId} userId
 * @returns {Promise<boolean>}
 */
const isLastActiveAdmin = async (userId) => {
  const activeAdminCount = await User.countDocuments({
    role: 'admin',
    isActive: true,
    deletedAt: { $exists: false },
    _id: { $ne: userId },
  });
  return activeAdminCount === 0;
};

module.exports = {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  getUserByPhoneNumber,
  updateUserById,
  softDeleteUserById,
  isLastActiveAdmin,
};
