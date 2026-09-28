const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');

const { TEAMS, PLACE_POINTS } = require('../teams');

// Ranked results for one program. Only the final AVERAGED score is exposed -
// individual judge scores stay internal to the scores table (confidential).
// Equal averages share a place (1, 1, 3 ...), like a normal competition.
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

// A judge assigned to the program publishes its results once every participant
// has been scored by every judge on the panel.
router.post('/:programId/publish', (req, res) => {
  const { programId } = req.params;
  const judgeId = req.body.judge_id;
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const assigned = db.prepare('SELECT 1 FROM program_judges WHERE program_id = ? AND judge_id = ?').get(programId, judgeId);
  if (!assigned) return res.status(403).json({ error: 'Only a judge assigned to this program can publish its results' });
  if (program.results_published) return res.json({ ok: true, already: true });

  const regs = db.prepare('SELECT status FROM registrations WHERE program_id = ?').all(programId);
  if (regs.length === 0) return res.status(409).json({ error: 'No participants registered for this program' });
  const pending = regs.filter(r => r.status !== 'judged').length;
  if (pending > 0) {
    return res.status(409).json({ error: `${pending} participant(s) still need scores from every judge` });
  }

  db.prepare("UPDATE programs SET results_published = 1, published_at = datetime('now') WHERE id = ?").run(programId);
  db.prepare("UPDATE registrations SET status = 'results_announced' WHERE program_id = ? AND status = 'judged'").run(programId);
  req.app.get('io').emit('results:published', { program_id: Number(programId) });
  res.json({ ok: true });
});

// Organizer / judge view: averaged scores, no names.
router.get('/:programId', (req, res) => {
  res.json(computeRankings(req.params.programId));
});

// Certificate PDF for a placed participant (1st/2nd/3rd). Streams a simple generated PDF.
router.get('/:programId/certificate/:registrationId', (req, res) => {
  const { programId, registrationId } = req.params;
  const { ranked } = computeRankings(programId);
  const entry = ranked.find(r => String(r.registration_id) === String(registrationId));
  if (!entry || entry.rank > 3) return res.status(404).json({ error: 'No certificate available (not placed 1st-3rd)' });

  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(programId);
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
