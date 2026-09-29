const express = require('express');
const router = express.Router();
const db = require('../db');
const { TEAMS } = require('../teams');
const { requireOrganizerOrControlAdmin } = require('../sessionAuth');
const { activeScores, assignedJudgeIds, registrationIsFullyScored } = require('../registrationJudges');

router.use(requireOrganizerOrControlAdmin);

// Organizer dashboard: counts for everything. Only counts are exposed here —
// individual judge scores stay confidential.
router.get('/stats', (req, res) => {
  const one = (sql) => db.prepare(sql).get().c;

  const totals = {
    programs: one('SELECT COUNT(*) c FROM programs'),
    registrations: one('SELECT COUNT(*) c FROM registrations'),
    online: one("SELECT COUNT(*) c FROM registrations WHERE source = 'online'"),
    onsite: one("SELECT COUNT(*) c FROM registrations WHERE source = 'onsite'"),
    unique_students: one('SELECT COUNT(DISTINCT student_id) c FROM registrations'),
    judges: one("SELECT COUNT(*) c FROM users WHERE role = 'judge'"),
    scores_submitted: db.prepare('SELECT id FROM registrations').all().reduce((sum, row) => sum + activeScores(row.id).length, 0),
    fully_judged: one("SELECT COUNT(*) c FROM registrations WHERE status IN ('judged','results_announced')"),
    published_programs: one('SELECT COUNT(*) c FROM programs WHERE results_published = 1'),
    by_category: Object.fromEntries(['premier', 'junior'].map(c => [c, db.prepare('SELECT COUNT(*) c FROM registrations r JOIN programs p ON p.id = r.program_id WHERE p.category = ?').get(c).c])),
    programs_by_category: Object.fromEntries(['premier', 'junior'].map(c => [c, db.prepare('SELECT COUNT(*) c FROM programs WHERE category = ?').get(c).c])),
    by_team: Object.fromEntries(TEAMS.map(t => [t, db.prepare('SELECT COUNT(*) c FROM registrations WHERE team_name = ?').get(t).c]))
  };

  const programs = db.prepare("SELECT * FROM programs ORDER BY CASE category WHEN 'premier' THEN 0 WHEN 'junior' THEN 1 ELSE 2 END, number, id").all().map(p => {
    const registrations = db.prepare('SELECT id, code_letter FROM registrations WHERE program_id = ?').all(p.id);
    const registered = registrations.length;
    const codeAssigned = registrations.filter(row => !String(row.code_letter).startsWith('PENDING-'));
    const judges = db.prepare('SELECT COUNT(*) c FROM program_judges WHERE program_id = ?').get(p.id).c;
    const scores = codeAssigned.reduce((sum, row) => sum + activeScores(row.id).length, 0);
    const scoresExpected = codeAssigned.reduce((sum, row) => sum + assignedJudgeIds(row.id).length, 0);
    const judged = codeAssigned.filter(row => registrationIsFullyScored(row.id)).length;
    return {
      id: p.id, name: p.name, code: p.code, type: p.type, category: p.category, number: p.number, quota: p.quota, published: !!p.results_published,
      registered, spots_left: p.quota ? Math.max(p.quota - registered, 0) : null,
      judges, scores_submitted: scores, scores_expected: scoresExpected, fully_judged: judged
    };
  });

  const judges = db.prepare("SELECT id, code, name FROM users WHERE role = 'judge'").all().map(j => {
    const assigned = db.prepare('SELECT program_id FROM program_judges WHERE judge_id = ?').all(j.id);
    const registrations = assigned.flatMap(a => db.prepare("SELECT id FROM registrations WHERE program_id = ? AND code_letter NOT LIKE 'PENDING-%'").all(a.program_id));
    const expected = registrations.filter(row => assignedJudgeIds(row.id).includes(j.id)).length;
    const submitted = registrations.reduce((sum, row) => sum + activeScores(row.id).filter(score => score.judge_id === j.id).length, 0);
    return { ...j, programs_assigned: assigned.length, scores_submitted: submitted, scores_expected: expected };
  });

  const scheduleConflicts = db.prepare(`SELECT u.id AS judge_id, u.name AS judge_name, p.time_slot,
      GROUP_CONCAT(p.name, ' · ') AS programs
    FROM program_judges pj JOIN users u ON u.id = pj.judge_id
    JOIN programs p ON p.id = pj.program_id
    WHERE u.role = 'judge' AND p.time_slot IS NOT NULL AND TRIM(p.time_slot) != ''
    GROUP BY u.id, p.time_slot HAVING COUNT(*) > 1`).all();

  res.json({ totals, programs, judges, schedule_conflicts: scheduleConflicts });
});

router.get('/audit-log', (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all();
  res.json(rows.map(row => ({ ...row, details: JSON.parse(row.details || '{}') })));
});

router.get('/registrations.csv', (req, res) => {
  const rows = db.prepare(`SELECT r.participant_id, r.code_letter, r.student_name, r.student_id, r.team_name, r.program_id,
    p.name AS program, r.is_team, r.team_members, r.language, r.source, r.status
    FROM registrations r JOIN programs p ON p.id = r.program_id ORDER BY p.name, r.created_at`).all();
  const fields = ['participant_id','code_letter','student_name','student_id','team_name','program_id','program','is_team','team_members','language','source','status'];
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [fields.join(','), ...rows.map(row => fields.map(field => quote(
    String(row.code_letter).startsWith('PENDING-') && ['participant_id', 'code_letter'].includes(field) ? '' : row[field]
  )).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="festival-registrations.csv"');
  res.send(`\uFEFF${csv}`);
});

module.exports = router;
