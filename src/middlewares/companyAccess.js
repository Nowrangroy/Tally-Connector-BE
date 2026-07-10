const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Middleware to enforce company-level access control on MCP tool calls.
 *
 * Rules:
 *  - Admin role → always allowed (no restriction)
 *  - User role:
 *    - If targetCompany is present in the request, it must be in req.user.companies
 *    - If targetCompany is absent, the request is allowed (tool may not require a company)
 *
 * targetCompany is read from:
 *  1. req.body.targetCompany
 *  2. req.body.arguments.targetCompany  (MCP /call format)
 */
const checkCompanyAccess = (req, res, next) => {
  const { user } = req;

  // Admins have unrestricted access
  if (user && user.role === 'admin') {
    return next();
  }

  // Extract targetCompany from the request body (handles both flat and nested MCP formats)
  const targetCompany =
    (req.body && req.body.targetCompany) ||
    (req.body && req.body.arguments && req.body.arguments.targetCompany) ||
    null;

  // No targetCompany in body — allow (tool may not be company-specific)
  if (!targetCompany) {
    return next();
  }

  // For regular users, check whether targetCompany is in their allowed list
  const userCompanies = (user && user.companies) || [];
  if (!userCompanies.includes(targetCompany)) {
    return next(
      new ApiError(httpStatus.FORBIDDEN, `Access denied: you do not have access to company "${targetCompany}"`)
    );
  }

  return next();
};

module.exports = checkCompanyAccess;
