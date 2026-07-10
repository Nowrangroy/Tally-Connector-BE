const { parsePhoneNumber, isValidPhoneNumber } = require('libphonenumber-js');

/**
 * Normalize a phone number to E.164 format.
 * Handles:
 *  - Already valid E.164:  "+919876543210" → "+919876543210"
 *  - 10-digit Indian:      "9876543210"    → "+919876543210"
 *  - With country code:    "919876543210"  → "+919876543210"
 * @param {string} input - Raw phone number string
 * @returns {string} E.164 formatted phone number
 * @throws {Error} if the phone number is invalid
 */
const normalizePhoneNumber = (input) => {
  if (!input || typeof input !== 'string') {
    throw new Error('Phone number is required');
  }

  const trimmed = input.trim().replace(/\s+/g, '');

  // Try parsing as-is first (handles +91xxxxxxxx or international)
  if (isValidPhoneNumber(trimmed)) {
    const parsed = parsePhoneNumber(trimmed);
    return parsed.format('E.164');
  }

  // Try treating as a 10-digit Indian number
  if (/^\d{10}$/.test(trimmed)) {
    const withCountry = `+91${trimmed}`;
    if (isValidPhoneNumber(withCountry)) {
      return parsePhoneNumber(withCountry).format('E.164');
    }
  }

  // Try treating as 91xxxxxxxxxx (12 digits starting with 91)
  if (/^91\d{10}$/.test(trimmed)) {
    const withPlus = `+${trimmed}`;
    if (isValidPhoneNumber(withPlus)) {
      return parsePhoneNumber(withPlus).format('E.164');
    }
  }

  throw new Error(`Invalid phone number: ${input}`);
};

/**
 * Check if a string is a valid E.164 phone number.
 * @param {string} phoneNumber
 * @returns {boolean}
 */
const isValidE164 = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') return false;
  return /^\+[1-9]\d{1,14}$/.test(phoneNumber) && isValidPhoneNumber(phoneNumber);
};

module.exports = {
  normalizePhoneNumber,
  isValidE164,
};
