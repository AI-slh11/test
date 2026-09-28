const express = require('express');
const router = express.Router();
const db = require('../db');

// Simple code+password login. Returns the user record (no name shown to other roles).
// Note: this is intentionally minimal (no JWT/hashing) to keep the MVP easy to run;
// swap in bcrypt + JWT before any real deployment.
router.post('/login', (req, res) => {
  const { code, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE code = ? AND password = ?').get(code, password);
  if (!user) return res.status(401).json({ error: 'Invalid code or password' });
  delete user.password;
  res.json({ user });
});

// Organizer-only: create a new judge login
router.post('/judges', (req, res) => {
  const { code, password, name } = req.body;
  if (!code || !password || !name) return res.status(400).json({ error: 'code, password, name required' });
  try {
    db.prepare('INSERT INTO users (code, password, name, role) VALUES (?,?,?,\'judge\')').run(code, password, name);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Judge code already exists' });
  }
});

router.get('/judges', (req, res) => {
  const judges = db.prepare("SELECT id, code, name FROM users WHERE role = 'judge'").all();
  res.json(judges);
});

router.patch('/judges/:id', (req, res) => {
  const cur = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'judge'").get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Judge not found' });
  const { code, password, name } = req.body;
  try {
    db.prepare('UPDATE users SET code=?, password=?, name=? WHERE id=?')
      .run(code || cur.code, password || cur.password, name || cur.name, cur.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'That judge code is already in use' });
  }
});

router.delete('/judges/:id', (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'judge'").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
