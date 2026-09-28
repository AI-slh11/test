const crypto = require('crypto');
const db = require('./db');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function issueSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { id: user.id, code: user.code, role: user.role, expires: Date.now() + TOKEN_TTL_MS });
  return token;
}

function sessionForToken(token) {
  const session = sessions.get(token);
  if (!session || session.expires <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  return header.replace(/^Bearer\s+/i, '');
}

function optionalAuth(req, res, next) {
  const token = tokenFromRequest(req);
  req.user = token ? sessionForToken(token) : null;
  next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Sign in required' });
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => requireAuth(req, res, () => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  });
}

function requireOrganizerOrControlAdmin(req, res, next) {
  if (req.admin) return next();
  return requireRole('organizer')(req, res, next);
}

function isAssignedJudge(judgeId, programId) {
  return !!db.prepare(`SELECT 1 FROM program_judges pj JOIN users u ON u.id = pj.judge_id
    WHERE pj.judge_id = ? AND pj.program_id = ? AND u.role = 'judge'`).get(judgeId, programId);
}

function logout(token) { sessions.delete(token); }
function revokeSessionsForUser(userId) {
  for (const [token, session] of sessions) if (String(session.id) === String(userId)) sessions.delete(token);
}

module.exports = { issueSession, sessionForToken, tokenFromRequest, optionalAuth, requireAuth, requireRole, requireOrganizerOrControlAdmin, isAssignedJudge, logout, revokeSessionsForUser };
