const Joi = require('joi');
const { objectId } = require('./custom.validation');

const phoneNumberSchema = Joi.string()
  .trim()
  .pattern(/^\+?[0-9\s\-().]{7,20}$/)
  .messages({
    'string.pattern.base': '"phoneNumber" must be a valid phone number',
  });

const createUser = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    phoneNumber: phoneNumberSchema.required(),
    role: Joi.string().valid('user', 'admin').default('user'),
    companies: Joi.array().items(Joi.string().trim().min(1)).default([]),
  }),
};

const getUsers = {
  query: Joi.object().keys({
    name: Joi.string(),
    phoneNumber: Joi.string(),
    role: Joi.string().valid('user', 'admin'),
    isActive: Joi.boolean(),
    company: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim(),
      phoneNumber: phoneNumberSchema,
      role: Joi.string().valid('user', 'admin'),
      companies: Joi.array().items(Joi.string().trim().min(1)),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
};
