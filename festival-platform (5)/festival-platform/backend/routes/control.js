const express = require('express');
const router = express.Router();
const { login, requireAdmin, logout, changePassword } = require('../adminAuth');

// Hidden admin API. Everything except /login needs an admin token, and the
// admin console talks ONLY to this prefix. Reuses the existing route logic.
router.post('/login', (req, res) => {
  const r = login(req.body.code, req.body.password, req.ip);
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json({ token: r.token, code: r.code });
});

router.get('/session', requireAdmin, (req, res) => res.json({ ok: true, code: req.admin.code }));
router.post('/logout', requireAdmin, (req, res) => {
  logout((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  res.json({ ok: true });
});
router.post('/password', requireAdmin, (req, res) => {
  const err = changePassword(req.admin.adminId, req.body.current, req.body.next);
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true });
});

router.use('/programs', requireAdmin, require('./programs'));
router.use('/auth', requireAdmin, require('./auth'));            // judge accounts CRUD
router.use('/registrations', requireAdmin, require('./registrations'));
router.use('/admin', requireAdmin, require('./admin'));          // GET /admin/stats

module.exports = router;
