const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth, requireRole, requireOrganizerOrControlAdmin } = require('../sessionAuth');
const { assignmentConflict, assignmentConflictForSlot } = require('../judgeAssignments');
const { recordAudit } = require('../audit');
const { registrationIsFullyScored, updateJudgingStatus } = require('../registrationJudges');

const CATEGORIES = ['premier', 'junior'];
const FIRST_NUMBER = { premier: 28, junior: 96 };
const ORDER = "CASE category WHEN 'premier' THEN 0 WHEN 'junior' THEN 1 ELSE 2 END, number, id";

function nextNumber(category) {
  const max = db.prepare('SELECT MAX(number) m FROM programs WHERE category = ?').get(category).m;
  return max ? max + 1 : FIRST_NUMBER[category];
}

// List all programs (with assigned judges + registration counts)
router.get('/', optionalAuth, (req, res) => {
  const { category } = req.query;
  const programs = CATEGORIES.includes(category)
    ? db.prepare(`SELECT * FROM programs WHERE category = ? ORDER BY ${ORDER}`).all(category)
    : db.prepare(`SELECT * FROM programs ORDER BY ${ORDER}`).all();
  const judgesStmt = db.prepare(`
    SELECT u.id, u.code, u.name FROM program_judges pj
    JOIN users u ON u.id = pj.judge_id WHERE pj.program_id = ?
  `);
  const countStmt = db.prepare('SELECT COUNT(*) c FROM registrations WHERE program_id = ?');
  const result = programs.map(p => ({
    ...p,
    judges: req.user?.role === 'organizer' || req.admin ? judgesStmt.all(p.id) : [],
    registration_count: countStmt.get(p.id).c
  }));
  res.json(result);
});

// Programs assigned to a specific judge
router.get('/for-judge/:judgeId', requireRole('judge'), (req, res) => {
  if (String(req.user.id) !== String(req.params.judgeId)) return res.status(403).json({ error: 'You can only view your assigned programs' });
  const programs = db.prepare(`
    SELECT p.* FROM programs p
    JOIN program_judges pj ON pj.program_id = p.id
    WHERE pj.judge_id = ?
    ORDER BY CASE p.category WHEN 'premier' THEN 0 WHEN 'junior' THEN 1 ELSE 2 END, p.number, p.id
  `).all(req.params.judgeId);
  res.json(programs);
});

router.use(requireOrganizerOrControlAdmin);

// Create a program. category = premier | junior; number defaults to the next free one.
router.post('/', (req, res) => {
  const { name, code, type, language, time_slot, quota, category, judge_ids } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'name and category required' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'category must be premier or junior' });
  const progType = type || 'writing';
  if (!['writing', 'stage'].includes(progType)) return res.status(400).json({ error: 'type must be writing or stage' });
  const number = req.body.number ? Number(req.body.number) : nextNumber(category);
  if (!Number.isInteger(number) || number < 1) return res.status(400).json({ error: 'number must be a positive whole number' });
  if (db.prepare('SELECT 1 FROM programs WHERE category = ? AND number = ?').get(category, number)) {
    return res.status(409).json({ error: `Program number ${number} already exists in ${category}` });
  }
  const progCode = (code || `${category === 'premier' ? 'P' : 'J'}${number}`).toUpperCase();
  const q = quota ? Number(quota) : null;
  const judgeIds = [...new Set(Array.isArray(judge_ids) ? judge_ids.map(Number) : [])];
  if (judgeIds.some(id => !Number.isInteger(id) || id < 1)) return res.status(400).json({ error: 'Select valid judges' });
  for (const judgeId of judgeIds) {
    const conflict = assignmentConflictForSlot(judgeId, time_slot);
    if (conflict) return res.status(409).json({ error: conflict });
  }
  const create = db.transaction(() => {
    const info = db.prepare(
      'INSERT INTO programs (name, code, type, language, time_slot, quota, category, number) VALUES (?,?,?,?,?,?,?,?)'
    ).run(name.trim(), progCode, progType, language || null, time_slot || null, q, category, number);
    for (const jid of judgeIds) {
      db.prepare('INSERT OR IGNORE INTO program_judges (program_id, judge_id) VALUES (?,?)').run(info.lastInsertRowid, jid);
    }
    return info.lastInsertRowid;
  });
  const id = create();
  recordAudit(req, 'create', 'program', id, { name, category, number });
  res.status(201).json({ id, number });
});

// Assign a judge to a program (manual assignment by organizer)
router.post('/:id/judges', (req, res) => {
  const judge_id = Number(req.body?.judge_id);
  if (!Number.isInteger(judge_id) || judge_id < 1) return res.status(400).json({ error: 'Select a valid judge' });
  const conflict = assignmentConflict(req.params.id, judge_id);
  if (conflict) return res.status(conflict === 'Program not found' ? 404 : 409).json({ error: conflict });
  try {
    db.prepare('INSERT INTO program_judges (program_id, judge_id) VALUES (?,?)').run(req.params.id, judge_id);
    recordAudit(req, 'assign_judge', 'program', req.params.id, { judge_id });
    db.prepare('SELECT id FROM registrations WHERE program_id = ?').all(req.params.id).forEach(row => updateJudgingStatus(row.id));
    res.status(201).json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Judge is already assigned to this program' });
  }
});

router.delete('/:id/judges/:judgeId', (req, res) => {
  const program = db.prepare('SELECT id, results_published FROM programs WHERE id = ?').get(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  if (program.results_published) return res.status(409).json({ error: 'Unpublish this program before changing judge assignments' });
  const customPanelCount = db.prepare(`SELECT COUNT(*) c FROM registration_judges rj JOIN registrations r ON r.id = rj.registration_id
    WHERE r.program_id = ? AND rj.judge_id = ?`).get(program.id, req.params.judgeId).c;
  if (customPanelCount) return res.status(409).json({ error: `This judge is assigned to ${customPanelCount} custom student panel(s). Remove them from those panels first.` });
  db.prepare('DELETE FROM program_judges WHERE program_id = ? AND judge_id = ?').run(req.params.id, req.params.judgeId);
  recordAudit(req, 'unassign_judge', 'program', req.params.id, { judge_id: req.params.judgeId });
  db.prepare('SELECT id FROM registrations WHERE program_id = ?').all(program.id).forEach(row => updateJudgingStatus(row.id));
  res.json({ ok: true });
});

// Edit any program field
router.patch('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Program not found' });
  const b = req.body;
  const type = b.type ?? cur.type;
  if (!['writing', 'stage'].includes(type)) return res.status(400).json({ error: 'type must be writing or stage' });
  const category = 'category' in b ? (b.category || null) : cur.category;
  if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: 'category must be premier or junior' });
  const number = 'number' in b ? (b.number ? Number(b.number) : null) : cur.number;
  if (number !== null && (!Number.isInteger(number) || number < 1)) return res.status(400).json({ error: 'number must be a positive whole number' });
  if (category && number && db.prepare('SELECT 1 FROM programs WHERE category = ? AND number = ? AND id != ?').get(category, number, cur.id)) {
    return res.status(409).json({ error: `Program number ${number} already exists in ${category}` });
  }
  const quota = 'quota' in b ? (b.quota ? Number(b.quota) : null) : cur.quota;
  const nextTimeSlot = 'time_slot' in b ? (b.time_slot || null) : cur.time_slot;
  const assignedJudges = db.prepare('SELECT judge_id FROM program_judges WHERE program_id = ?').all(cur.id);
  for (const { judge_id: judgeId } of assignedJudges) {
    const conflict = assignmentConflictForSlot(judgeId, nextTimeSlot, cur.id);
    if (conflict) return res.status(409).json({ error: conflict });
  }
  db.prepare('UPDATE programs SET name=?, code=?, type=?, language=?, time_slot=?, quota=?, category=?, number=? WHERE id=?').run(
    b.name ?? cur.name, (b.code ?? cur.code).toUpperCase(), type,
    'language' in b ? (b.language || null) : cur.language,
    nextTimeSlot, quota, category, number, cur.id);
  recordAudit(req, 'edit', 'program', cur.id, { name: b.name ?? cur.name, time_slot: nextTimeSlot });
  res.json({ ok: true });
});

// Delete a program (also removes its registrations, scores and judge assignments)
router.delete('/:id', (req, res) => {
  const program = db.prepare('SELECT name FROM programs WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM programs WHERE id = ?').run(req.params.id);
  if (program) recordAudit(req, 'delete', 'program', req.params.id, { name: program.name });
  res.json({ ok: true });
});

// Organizer reviews standings before publishing them to the public feed.
router.patch('/:id/published', (req, res) => {
  const on = !!req.body.published;
  const prog = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!prog) return res.status(404).json({ error: 'Program not found' });
  const io = req.app.get('io');
  if (on) {
    const assignedJudgeCount = db.prepare('SELECT COUNT(*) c FROM program_judges WHERE program_id = ?').get(prog.id).c;
    const registrations = db.prepare('SELECT id FROM registrations WHERE program_id = ?').all(prog.id);
    const fullyJudged = assignedJudgeCount > 0 && registrations.length > 0 && registrations.every(r => registrationIsFullyScored(r.id));
    if (!fullyJudged) {
      return res.status(409).json({ error: 'All participants must be fully judged before results can be published' });
    }
    const requiredPlaces = Math.min(3, registrations.length);
    const assignedPlaces = new Set(db.prepare('SELECT result_place FROM registrations WHERE program_id = ? AND result_place IS NOT NULL').all(prog.id).map(row => row.result_place));
    const completePodium = requiredPlaces > 0 && Array.from({ length: requiredPlaces }, (_, index) => index + 1).every(place => assignedPlaces.has(place));
    if (!completePodium) {
      return res.status(409).json({ error: `Assign 1st, 2nd and 3rd places before publishing (${requiredPlaces} place${requiredPlaces === 1 ? '' : 's'} required)` });
    }
    if (!prog.results_published) {
      db.prepare("UPDATE programs SET results_published = 1, published_at = datetime('now') WHERE id = ?").run(prog.id);
      db.prepare("UPDATE registrations SET status = 'results_announced' WHERE program_id = ? AND status = 'judged'").run(prog.id);
    }
    io.emit('results:published', { program_id: prog.id });
  } else {
    db.prepare('UPDATE programs SET results_published = 0, published_at = NULL WHERE id = ?').run(prog.id);
    db.prepare("UPDATE registrations SET status = 'judged' WHERE program_id = ? AND status = 'results_announced'").run(prog.id);
    io.emit('results:unpublished', { program_id: prog.id });
  }
  if (req.user?.role === 'organizer' || req.admin) recordAudit(req, on ? 'publish_results' : 'unpublish_results', 'program', prog.id, { program: prog.name });
  res.json({ ok: true });
});

// Set or clear the registration quota (empty/0 = unlimited)
router.patch('/:id/quota', (req, res) => {
  const q = req.body.quota ? Number(req.body.quota) : null;
  if (q !== null && (!Number.isInteger(q) || q < 1)) return res.status(400).json({ error: 'quota must be a positive whole number' });
  db.prepare('UPDATE programs SET quota = ? WHERE id = ?').run(q, req.params.id);
  res.json({ ok: true });
});

module.exports = router;

