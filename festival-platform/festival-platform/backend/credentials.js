const crypto = require('crypto');

const PREFIX = 'scrypt$';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${PREFIX}${salt}$${key}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return false;
  const [, salt, key] = stored.split('$');
  if (!salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = crypto.scryptSync(String(password), salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword, PREFIX };
