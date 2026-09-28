const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole, isAssignedJudge } = require('../sessionAuth');

// Judge submits a score. Final once submitted - no revision endpoint exists on purpose.
router.post('/', requireRole('judge'), (req, res) => {
  const { registration_id, judge_id, score, grade, remarks } = req.body;
  if (registration_id == null || judge_id == null || score == null || !grade) {
    return res.status(400).json({ error: 'registration_id, judge_id, score, grade required' });
  }
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    return res.status(400).json({ error: 'score must be a number between 0 and 100' });
  }
  if (!['A', 'B', 'C', 'D', 'F'].includes(grade)) return res.status(400).json({ error: 'grade must be A, B, C, D or F' });
  if (remarks != null && (typeof remarks !== 'string' || remarks.length > 500)) {
    return res.status(400).json({ error: 'remarks must be text of at most 500 characters' });
  }

  const registration = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registration_id);
  if (!registration) return res.status(404).json({ error: 'Registration not found' });
  if (Number(judge_id) !== req.user.id || !isAssignedJudge(req.user.id, registration.program_id)) {
    return res.status(403).json({ error: 'You are not assigned to score this participant' });
  }

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
router.get('/by-judge/:judgeId', requireRole('judge'), (req, res) => {
  if (String(req.user.id) !== String(req.params.judgeId)) return res.status(403).json({ error: 'You can only view your own scores' });
  const rows = db.prepare('SELECT registration_id, score, grade, remarks FROM scores WHERE judge_id = ?').all(req.params.judgeId);
  res.json(rows);
});

module.exports = router;
