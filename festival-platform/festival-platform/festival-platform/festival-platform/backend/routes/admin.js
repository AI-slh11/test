const express = require('express');
const router = express.Router();
const db = require('../db');
const { TEAMS } = require('../teams');
const { requireOrganizerOrControlAdmin } = require('../sessionAuth');

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
    scores_submitted: one('SELECT COUNT(*) c FROM scores'),
    fully_judged: one("SELECT COUNT(*) c FROM registrations WHERE status IN ('judged','results_announced')"),
    published_programs: one('SELECT COUNT(*) c FROM programs WHERE results_published = 1'),
    by_category: Object.fromEntries(['premier', 'junior'].map(c => [c, db.prepare('SELECT COUNT(*) c FROM registrations r JOIN programs p ON p.id = r.program_id WHERE p.category = ?').get(c).c])),
    programs_by_category: Object.fromEntries(['premier', 'junior'].map(c => [c, db.prepare('SELECT COUNT(*) c FROM programs WHERE category = ?').get(c).c])),
    by_team: Object.fromEntries(TEAMS.map(t => [t, db.prepare('SELECT COUNT(*) c FROM registrations WHERE team_name = ?').get(t).c]))
  };

  const programs = db.prepare("SELECT * FROM programs ORDER BY CASE category WHEN 'premier' THEN 0 WHEN 'junior' THEN 1 ELSE 2 END, number, id").all().map(p => {
    const registered = db.prepare('SELECT COUNT(*) c FROM registrations WHERE program_id = ?').get(p.id).c;
    const judges = db.prepare('SELECT COUNT(*) c FROM program_judges WHERE program_id = ?').get(p.id).c;
    const scores = db.prepare(`SELECT COUNT(*) c FROM scores s JOIN registrations r ON r.id = s.registration_id WHERE r.program_id = ?`).get(p.id).c;
    const judged = db.prepare("SELECT COUNT(*) c FROM registrations WHERE program_id = ? AND status IN ('judged','results_announced')").get(p.id).c;
    return {
      id: p.id, name: p.name, code: p.code, type: p.type, category: p.category, number: p.number, quota: p.quota, published: !!p.results_published,
      registered, spots_left: p.quota ? Math.max(p.quota - registered, 0) : null,
      judges, scores_submitted: scores, scores_expected: registered * judges, fully_judged: judged
    };
  });

  const judges = db.prepare("SELECT id, code, name FROM users WHERE role = 'judge'").all().map(j => {
    const assigned = db.prepare('SELECT program_id FROM program_judges WHERE judge_id = ?').all(j.id);
    const expected = assigned.reduce((sum, a) =>
      sum + db.prepare('SELECT COUNT(*) c FROM registrations WHERE program_id = ?').get(a.program_id).c, 0);
    const submitted = db.prepare('SELECT COUNT(*) c FROM scores WHERE judge_id = ?').get(j.id).c;
    return { ...j, programs_assigned: assigned.length, scores_submitted: submitted, scores_expected: expected };
  });

  res.json({ totals, programs, judges });
});

module.exports = router;
