const express = require('express');
const router = express.Router();
const db = require('../db');
const { TEAMS } = require('../teams');

// 4 digits + 2-3 letters + 3 digits, e.g. 2023CSE001
const STUDENT_ID_RE = /^\d{4}[A-Z]{2,3}\d{3}$/;

function letterForIndex(n) {
  // 0 -> A, 1 -> B ... 25 -> Z, 26 -> AA, 27 -> AB ...
  let s = '';
  n = n + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Register a student for a program. Works identically for organizer on-site (Green Room)
// registration and public online self-registration; `source` distinguishes them.
router.post('/', (req, res) => {
  const { program_id, student_name, student_id, is_team, team_members, language, source, team_name } = req.body;
  if (!program_id || !student_name || !student_id) {
    return res.status(400).json({ error: 'program_id, student_name, student_id required' });
  }
  if (!TEAMS.includes(team_name)) {
    return res.status(400).json({ error: `Please choose a team: ${TEAMS.join(' or ')}` });
  }
  const studentId = String(student_id).trim().toUpperCase();
  if (!STUDENT_ID_RE.test(studentId)) {
    return res.status(400).json({ error: 'Invalid Student ID. Format: 4 digits, 2-3 letters, 3 digits (e.g. 2023CSE001)' });
  }
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(program_id);
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const duplicate = db.prepare('SELECT id FROM registrations WHERE program_id = ? AND student_id = ?').get(program_id, studentId);
  if (duplicate) return res.status(409).json({ error: 'This Student ID is already registered for this program' });

  const existingCount = db.prepare('SELECT COUNT(*) c FROM registrations WHERE program_id = ?').get(program_id).c;
  if (program.quota && existingCount >= program.quota) {
    return res.status(409).json({ error: `Registration closed — this program is full (${program.quota} spots)` });
  }
  // Skip past any IDs already used (an admin may have deleted a registration earlier)
  let idx = existingCount;
  let codeLetter, participantId;
  do {
    codeLetter = letterForIndex(idx);
    participantId = `FEST-${program.code}-${String(idx + 1).padStart(3, '0')}-${codeLetter}`;
    idx++;
  } while (db.prepare('SELECT 1 FROM registrations WHERE participant_id = ?').get(participantId));

  const info = db.prepare(`
    INSERT INTO registrations (program_id, student_name, student_id, is_team, team_members, language, code_letter, participant_id, source, team_name)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    program_id, student_name, studentId, is_team ? 1 : 0, team_members || null,
    language || program.language || null, codeLetter, participantId, source === 'onsite' ? 'onsite' : 'online', team_name
  );

  const registration = db.prepare('SELECT * FROM registrations WHERE id = ?').get(info.lastInsertRowid);

  // Real-time push to any judge portal open on this program (Green Room -> Judge Portal sync)
  const io = req.app.get('io');
  io.to(`program:${program_id}`).emit('registration:new', {
    id: registration.id,
    program_id,
    code_letter: registration.code_letter,
    participant_id: registration.participant_id,
    status: registration.status,
    is_team: !!registration.is_team
  });

  res.status(201).json({ registration });
});

// Organizer / full view: includes student name & ID
router.get('/', (req, res) => {
  const { program_id } = req.query;
  const rows = program_id
    ? db.prepare('SELECT * FROM registrations WHERE program_id = ? ORDER BY created_at ASC').all(program_id)
    : db.prepare('SELECT * FROM registrations ORDER BY created_at DESC').all();
  res.json(rows);
});

// Judge view: anonymized - code letter + status only, no student name/ID
router.get('/judge-view', (req, res) => {
  const { program_id } = req.query;
  if (!program_id) return res.status(400).json({ error: 'program_id required' });
  const rows = db.prepare(`
    SELECT id, program_id, code_letter, participant_id, is_team, status, created_at
    FROM registrations WHERE program_id = ? ORDER BY created_at ASC
  `).all(program_id);
  res.json(rows);
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const valid = ['registered', 'submission_received', 'slot_assigned', 'judged', 'results_announced'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'invalid status' });
  db.prepare('UPDATE registrations SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// Admin: edit a registration's details (code letter / participant ID stay fixed)
router.patch('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Registration not found' });
  const b = req.body;
  let studentId = cur.student_id;
  if (b.student_id !== undefined) {
    studentId = String(b.student_id).trim().toUpperCase();
    if (!STUDENT_ID_RE.test(studentId)) return res.status(400).json({ error: 'Invalid Student ID format' });
    const dup = db.prepare('SELECT id FROM registrations WHERE program_id = ? AND student_id = ? AND id != ?').get(cur.program_id, studentId, cur.id);
    if (dup) return res.status(409).json({ error: 'That Student ID is already registered for this program' });
  }
  // empty string = "leave as is" (older registrations may have no team yet)
  if (b.team_name && !TEAMS.includes(b.team_name)) return res.status(400).json({ error: 'Invalid team' });
  db.prepare('UPDATE registrations SET student_name=?, student_id=?, is_team=?, team_members=?, language=?, team_name=? WHERE id=?').run(
    b.student_name ?? cur.student_name, studentId,
    'is_team' in b ? (b.is_team ? 1 : 0) : cur.is_team,
    'team_members' in b ? (b.team_members || null) : cur.team_members,
    'language' in b ? (b.language || null) : cur.language, b.team_name || cur.team_name, cur.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const cur = db.prepare('SELECT program_id FROM registrations WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM registrations WHERE id = ?').run(req.params.id);
  if (cur) req.app.get('io').to(`program:${cur.program_id}`).emit('score:submitted', {});
  res.json({ ok: true });
});

module.exports = router;
