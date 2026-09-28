const express = require('express');
const router = express.Router();
const db = require('../db');

// Judge submits a score. Final once submitted - no revision endpoint exists on purpose.
router.post('/', (req, res) => {
  const { registration_id, judge_id, score, grade, remarks } = req.body;
  if (registration_id == null || judge_id == null || score == null || !grade) {
    return res.status(400).json({ error: 'registration_id, judge_id, score, grade required' });
  }
  if (score < 0 || score > 100) return res.status(400).json({ error: 'score must be between 0 and 100' });
  if (remarks && remarks.length > 500) return res.status(400).json({ error: 'remarks max 500 characters' });

  const registration = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registration_id);
  if (!registration) return res.status(404).json({ error: 'Registration not found' });

  try {
    db.prepare(`
      INSERT INTO scores (registration_id, judge_id, score, grade, remarks) VALUES (?,?,?,?,?)
    `).run(registration_id, judge_id, score, grade, remarks || null);
  } catch (e) {
    return res.status(409).json({ error: 'This judge has already submitted a final score for this participant' });
  }

  // If every judge assigned to the program has now scored this participant, mark as judged.
  const assignedJudges = db.prepare('SELECT COUNT(*) c FROM program_judges WHERE program_id = ?').get(registration.program_id).c;
  const scoredJudges = db.prepare('SELECT COUNT(*) c FROM scores WHERE registration_id = ?').get(registration_id).c;
  if (assignedJudges > 0 && scoredJudges >= assignedJudges) {
    db.prepare("UPDATE registrations SET status = 'judged' WHERE id = ?").run(registration_id);
  }

  const io = req.app.get('io');
  io.to(`program:${registration.program_id}`).emit('score:submitted', {
    registration_id, code_letter: registration.code_letter
  });

  res.status(201).json({ ok: true });
});

// All scores a specific judge has already given (so their UI can grey those out)
router.get('/by-judge/:judgeId', (req, res) => {
  const rows = db.prepare('SELECT registration_id, score, grade, remarks FROM scores WHERE judge_id = ?').all(req.params.judgeId);
  res.json(rows);
});

module.exports = router;
