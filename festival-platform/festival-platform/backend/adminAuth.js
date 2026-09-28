const crypto = require('crypto');
const db = require('./db');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const tokens = new Map();                // token -> { adminId, code, expires }
const attempts = new Map();              // ip -> { count, lockedUntil }

const hash = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};
const verify = (password, stored) => {
  const [salt, key] = stored.split(':');
  const a = Buffer.from(key, 'hex');
  const b = crypto.scryptSync(password, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Admin account: ADMIN_CODE + ADMIN_PASSWORD env vars win. Otherwise a one-time random
// password is generated on first run and printed to the server log (never hardcoded).
function ensureAdmin() {
  const code = process.env.ADMIN_CODE;
  const password = process.env.ADMIN_PASSWORD;
  if (code && password) {
    const row = db.prepare('SELECT id FROM admins WHERE code = ?').get(code);
    if (row) db.prepare('UPDATE admins SET pass_hash = ? WHERE id = ?').run(hash(password), row.id);
    else db.prepare('INSERT INTO admins (code, pass_hash) VALUES (?,?)').run(code, hash(password));
    return;
  }
  if (db.prepare('SELECT COUNT(*) c FROM admins').get().c === 0) {
    const generated = crypto.randomBytes(9).toString('base64url');
    db.prepare('INSERT INTO admins (code, pass_hash) VALUES (?,?)').run('ADMIN-001', hash(generated));
    console.log('==================================================');
    console.log(' Admin account created (shown once):');
    console.log('   code:     ADMIN-001');
    console.log(`   password: ${generated}`);
    console.log(' Set ADMIN_CODE / ADMIN_PASSWORD env vars to choose your own.');
    console.log('==================================================');
  }
}

function login(code, password, ip) {
  const a = attempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (a.lockedUntil > Date.now()) return { error: 'Too many attempts. Try again in a minute.', status: 429 };
  const row = db.prepare('SELECT * FROM admins WHERE code = ?').get(String(code || ''));
  if (!row || !verify(String(password || ''), row.pass_hash)) {
    a.count += 1;
    if (a.count >= 5) { a.lockedUntil = Date.now() + 60_000; a.count = 0; }
    attempts.set(ip, a);
    return { error: 'Invalid admin credentials', status: 401 };
  }
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, { adminId: row.id, code: row.code, expires: Date.now() + TOKEN_TTL_MS });
  return { token, code: row.code };
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const t = tokens.get(token);
  if (!t || t.expires < Date.now()) {
    tokens.delete(token);
    return res.status(401).json({ error: 'Admin session expired. Please sign in again.' });
  }
  req.admin = t;
  next();
}

const logout = (token) => tokens.delete(token);

function changePassword(adminId, current, next) {
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
  if (!row || !verify(String(current || ''), row.pass_hash)) return 'Current password is incorrect';
  if (String(next || '').length < 8) return 'New password must be at least 8 characters';
  db.prepare('UPDATE admins SET pass_hash = ? WHERE id = ?').run(hash(next), adminId);
  return null;
}

module.exports = { ensureAdmin, login, requireAdmin, logout, changePassword };
