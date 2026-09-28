const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');

const { TEAMS, PLACE_POINTS } = require('../teams');
const { requireRole } = require('../sessionAuth');

// Ranked results for one program. Judge-by-judge details are only returned by
// the organizer-only review endpoint below.
function computeRankings(programId, withIdentity = false) {
  const registrations = db.prepare('SELECT * FROM registrations WHERE program_id = ?').all(programId);
  const rows = registrations.map(r => {
    const agg = db.prepare('SELECT AVG(score) avg_score, COUNT(*) n FROM scores WHERE registration_id = ?').get(r.id);
    const row = {
      registration_id: r.id,
      participant_id: r.participant_id,
      code_letter: r.code_letter,
      is_team: !!r.is_team,
      status: r.status,
      result_place: r.result_place,
      judges_submitted: agg.n,
      average_score: agg.n > 0 ? Math.round(agg.avg_score * 100) / 100 : null
    };
    if (withIdentity) {
      row.team_name = r.team_name;
      row.student_name = r.student_name;
      row.team_members = r.team_members;
    }
    return row;
  });
  const judged = rows.filter(r => r.average_score !== null).sort((a, b) => b.average_score - a.average_score);
  const unjudged = rows.filter(r => r.average_score === null);
  const manuallyPlaced = judged.filter(r => r.result_place !== null).sort((a, b) => a.result_place - b.result_place);
  if (manuallyPlaced.length) {
    const remaining = judged.filter(r => r.result_place === null);
    manuallyPlaced.forEach(r => { r.rank = r.result_place; });
    remaining.forEach((r, i) => {
      r.rank = i > 0 && remaining[i - 1].average_score === r.average_score
        ? remaining[i - 1].rank : i + 4;
    });
    return { ranked: [...manuallyPlaced, ...remaining].sort((a, b) => a.rank - b.rank), pending: unjudged };
  }
  judged.forEach((r, i) => {
    r.rank = i > 0 && judged[i - 1].average_score === r.average_score ? judged[i - 1].rank : i + 1;
  });
  return { ranked: judged, pending: unjudged };
}

// ---- Public, published-only feed for the home page / leaderboard ----
// Winners (top 3) are shown by name once published; everyone else by code letter only.
function buildPublicFeed() {
  const programs = db.prepare(
    'SELECT * FROM programs WHERE results_published = 1 ORDER BY published_at DESC, id DESC'
  ).all();
  const standings = Object.fromEntries(TEAMS.map(t => [t, 0]));

  const published = programs.map(p => {
    const { ranked } = computeRankings(p.id, true);
    ranked.forEach(r => {
      if (r.rank <= 3 && standings[r.team_name] !== undefined) standings[r.team_name] += PLACE_POINTS[r.rank];
    });
    return {
      program: { id: p.id, name: p.name, code: p.code, type: p.type, category: p.category, number: p.number },
      published_at: p.published_at,
      results: ranked.map(r => ({
        rank: r.rank,
        code_letter: r.code_letter,
        team_name: r.team_name,
        average_score: r.average_score,
        is_group: r.is_team,
        name: r.rank <= 3 ? r.student_name : null,
        members: r.rank <= 3 && r.is_team ? r.team_members : null
      }))
    };
  });

  return { teams: TEAMS, points: PLACE_POINTS, standings, published };
}

// NOTE: /public/feed must be declared before /:programId so "public" isn't read as an id.
router.get('/public/feed', (req, res) => res.json(buildPublicFeed()));

// Organizer-only review includes each submitted judge score and registration identity.
router.get('/:programId/review', requireRole('organizer'), (req, res) => {
  const program = db.prepare(`SELECT id, name, code, category, number, results_published, published_at
    FROM programs WHERE id = ?`).get(req.params.programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const judges = db.prepare(`SELECT u.id, u.code, u.name FROM program_judges pj
    JOIN users u ON u.id = pj.judge_id WHERE pj.program_id = ? ORDER BY u.name`).all(program.id);
  const participants = db.prepare(`SELECT r.id AS registration_id, r.participant_id, r.code_letter,
      r.student_name, r.team_name, r.is_team, r.team_members, r.status, r.result_place,
      COUNT(s.id) AS judges_submitted, AVG(s.score) AS average_score
    FROM registrations r LEFT JOIN scores s ON s.registration_id = r.id
    WHERE r.program_id = ? GROUP BY r.id ORDER BY r.code_letter, r.id`).all(program.id);
  const scores = db.prepare(`SELECT s.registration_id, s.judge_id, u.name AS judge_name,
      s.score, s.grade, s.remarks, s.created_at
    FROM scores s JOIN users u ON u.id = s.judge_id
    JOIN registrations r ON r.id = s.registration_id
    WHERE r.program_id = ? ORDER BY r.code_letter, u.name`).all(program.id);
  const scoresByRegistration = new Map();
  for (const score of scores) {
    const items = scoresByRegistration.get(score.registration_id) || [];
    items.push(score);
    scoresByRegistration.set(score.registration_id, items);
  }
  res.json({ program, judges, participants: participants.map(p => ({
    ...p,
    average_score: p.average_score == null ? null : Math.round(p.average_score * 100) / 100,
    scores: scoresByRegistration.get(p.registration_id) || []
  })) });
});

// Save the organizer's medal places for a program. Unselected participants are ranked by average score after 3rd place.
router.put('/:programId/placements', requireRole('organizer'), (req, res) => {
  const program = db.prepare('SELECT id, results_published FROM programs WHERE id = ?').get(req.params.programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  if (program.results_published) return res.status(409).json({ error: 'Unpublish this program before changing its places' });

  const placements = req.body?.placements;
  if (!Array.isArray(placements) || placements.length > 3) {
    return res.status(400).json({ error: 'placements must be an array with at most three entries' });
  }
  const registrationIds = new Set();
  const places = new Set();
  for (const item of placements) {
    const registrationId = Number(item?.registration_id);
    const place = Number(item?.place);
    if (!Number.isInteger(registrationId) || registrationId < 1 || ![1, 2, 3].includes(place)
      || registrationIds.has(registrationId) || places.has(place)) {
      return res.status(400).json({ error: 'Each participant and place (1st, 2nd, 3rd) can only be selected once' });
    }
    registrationIds.add(registrationId);
    places.add(place);
  }

  const assignedJudges = db.prepare('SELECT COUNT(*) c FROM program_judges WHERE program_id = ?').get(program.id).c;
  for (const item of placements) {
    const registrationId = Number(item.registration_id);
    const participant = db.prepare('SELECT id FROM registrations WHERE id = ? AND program_id = ?').get(registrationId, program.id);
    if (!participant) return res.status(400).json({ error: 'A selected participant does not belong to this program' });
    const submitted = db.prepare(`SELECT COUNT(*) c FROM scores s JOIN program_judges pj
      ON pj.judge_id = s.judge_id AND pj.program_id = ? WHERE s.registration_id = ?`).get(program.id, registrationId).c;
    if (assignedJudges === 0 || submitted < assignedJudges) {
      return res.status(409).json({ error: 'Only participants scored by every assigned judge can receive a place' });
    }
  }

  const save = db.transaction(() => {
    db.prepare('UPDATE registrations SET result_place = NULL WHERE program_id = ?').run(program.id);
    const update = db.prepare('UPDATE registrations SET result_place = ? WHERE id = ? AND program_id = ?');
    placements.forEach(item => update.run(Number(item.place), Number(item.registration_id), program.id));
  });
  try { save(); }
  catch { return res.status(409).json({ error: 'Places could not be saved. Refresh and try again.' }); }
  res.json({ ok: true, placements: placements.length });
});

// Unpublished standings are available to organizers for review only.
router.get('/:programId', requireRole('organizer'), (req, res) => {
  const program = db.prepare('SELECT id FROM programs WHERE id = ?').get(req.params.programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  res.json(computeRankings(req.params.programId));
});

// Certificate PDF for a placed participant (1st/2nd/3rd). Streams a simple generated PDF.
router.get('/:programId/certificate/:registrationId', requireRole('organizer'), (req, res) => {
  const { programId, registrationId } = req.params;
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  if (!program.results_published) return res.status(403).json({ error: 'Certificates are available after results are published' });
  const { ranked } = computeRankings(programId);
  const entry = ranked.find(r => String(r.registration_id) === String(registrationId));
  if (!entry || entry.rank > 3) return res.status(404).json({ error: 'No certificate available (not placed 1st-3rd)' });

  const placeLabel = { 1: '1st Place', 2: '2nd Place', 3: '3rd Place' }[entry.rank];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${entry.participant_id}.pdf"`);

  const doc = new PDFDocument({ layout: 'landscape', size: 'A4' });
  doc.pipe(res);
  doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();
  doc.fontSize(28).text('Certificate of Achievement', 0, 100, { align: 'center' });
  doc.fontSize(16).text('Campus Festival', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(20).text(placeLabel, { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text(`Program: ${program.name}${program.category ? ` (${program.category[0].toUpperCase() + program.category.slice(1)})` : ''}`, { align: 'center' });
  doc.text(`Participant Code: ${entry.code_letter}`, { align: 'center' });
  doc.text(`Participant ID: ${entry.participant_id}`, { align: 'center' });
  doc.end();
});

module.exports = router;

