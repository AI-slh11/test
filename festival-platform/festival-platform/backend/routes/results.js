const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const { TEAMS } = require('../teams');
const { requireRole } = require('../sessionAuth');
const { recordAudit } = require('../audit');
const { activeScores, assignedJudgeIds, registrationIsFullyScored } = require('../registrationJudges');
const STUDENT_ID_RE = /^\d{4}[A-Z]{2,3}\d{3}$/;

// Ranked results for one program. Judge-by-judge details are only returned by
// the organizer-only review endpoint below.
function computeRankings(programId, withIdentity = false) {
  const registrations = db.prepare('SELECT * FROM registrations WHERE program_id = ?').all(programId);
  const rows = registrations.map(r => {
    const scores = activeScores(r.id);
    const n = scores.length;
    const average = n ? scores.reduce((sum, score) => sum + score.score, 0) / n : null;
    const row = {
      registration_id: r.id,
      participant_id: r.participant_id,
      code_letter: r.code_letter,
      is_team: !!r.is_team,
      status: r.status,
      result_place: r.result_place,
      judges_submitted: n,
      average_score: average !== null ? Math.round(average * 100) / 100 : null
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
  let hasPointAssignments = false;

  const published = programs.map(p => {
    const { ranked } = computeRankings(p.id, true);
    const teamPoints = { 1: p.first_place_points, 2: p.second_place_points, 3: p.third_place_points };
    ranked.forEach(r => {
      const points = teamPoints[r.rank];
      if (r.rank <= 3 && points != null && standings[r.team_name] !== undefined) {
        standings[r.team_name] += points;
        hasPointAssignments = true;
      }
    });
    return {
      program: { id: p.id, name: p.name, code: p.code, type: p.type, category: p.category, number: p.number, team_points: teamPoints },
      published_at: p.published_at,
      results: ranked.map(r => ({
        rank: r.rank,
        code_letter: r.code_letter,
        team_name: r.team_name,
        team_points: teamPoints[r.rank] ?? null,
        average_score: r.average_score,
        is_group: r.is_team,
        name: r.rank <= 3 ? r.student_name : null,
        members: r.rank <= 3 && r.is_team ? r.team_members : null
      }))
    };
  });

  return { teams: TEAMS, has_points: hasPointAssignments, standings, published };
}

// NOTE: /public/feed must be declared before /:programId so "public" isn't read as an id.
router.get('/public/feed', (req, res) => res.json(buildPublicFeed()));

// Student self-service lookup. Only published final results are disclosed; judge
// scorecards and unpublished rankings remain private to the organizer.
router.post('/student-lookup', (req, res) => {
  const studentId = String(req.body?.student_id || '').trim().toUpperCase();
  if (!STUDENT_ID_RE.test(studentId)) {
    return res.status(400).json({ error: 'Enter a valid Student ID (for example, 2023CSE001)' });
  }

  const registrations = db.prepare(`SELECT r.id AS registration_id, r.participant_id, r.code_letter,
      r.status, r.team_name, p.id AS program_id, p.name AS program_name, p.category,
      p.number, p.type, p.results_published
    FROM registrations r JOIN programs p ON p.id = r.program_id
    WHERE r.student_id = ? ORDER BY p.category, p.number, p.name`).all(studentId);
  const rankingsByProgram = new Map();

  res.json({ registrations: registrations.map(registration => {
    let result = null;
    if (registration.results_published) {
      if (!rankingsByProgram.has(registration.program_id)) {
        rankingsByProgram.set(registration.program_id, computeRankings(registration.program_id).ranked);
      }
      const ranked = rankingsByProgram.get(registration.program_id)
        .find(item => item.registration_id === registration.registration_id);
      if (ranked) result = { rank: ranked.rank, average_score: ranked.average_score };
    }

    return {
      participant_id: registration.participant_id,
      code_letter: registration.code_letter,
      registration_status: registration.status,
      team_name: registration.team_name,
      program: {
        id: registration.program_id,
        name: registration.program_name,
        category: registration.category,
        number: registration.number,
        type: registration.type
      },
      results_published: !!registration.results_published,
      result
    };
  }) });
});

// Organizer-only review includes each submitted judge score and registration identity.
router.get('/:programId/review', requireRole('organizer'), (req, res) => {
  const program = db.prepare(`SELECT id, name, code, category, number, results_published, published_at,
      first_place_points, second_place_points, third_place_points
    FROM programs WHERE id = ?`).get(req.params.programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const judges = db.prepare(`SELECT DISTINCT u.id, u.code, u.name FROM users u
    WHERE u.role = 'judge' AND (
      EXISTS (SELECT 1 FROM program_judges pj WHERE pj.program_id = ? AND pj.judge_id = u.id)
      OR EXISTS (SELECT 1 FROM scores s JOIN registrations r ON r.id = s.registration_id
        WHERE r.program_id = ? AND s.judge_id = u.id)
    ) ORDER BY u.name`).all(program.id, program.id);
  const participants = db.prepare(`SELECT r.id AS registration_id, r.participant_id, r.code_letter,
      r.student_name, r.team_name, r.is_team, r.team_members, r.status, r.result_place
    FROM registrations r WHERE r.program_id = ? ORDER BY length(r.code_letter), r.code_letter, r.id`).all(program.id).map(participant => {
      const scores = activeScores(participant.registration_id);
      const average = scores.length ? scores.reduce((sum, score) => sum + score.score, 0) / scores.length : null;
      return { ...participant, assigned_judge_ids: assignedJudgeIds(participant.registration_id),
        judges_submitted: scores.length, average_score: average };
    });
  const scores = db.prepare(`SELECT s.id, s.registration_id, s.judge_id, u.name AS judge_name,
      s.score, s.grade, s.remarks, s.created_at
    FROM scores s JOIN users u ON u.id = s.judge_id
    JOIN registrations r ON r.id = s.registration_id
    WHERE r.program_id = ? ORDER BY length(r.code_letter), r.code_letter, u.name`).all(program.id);
  const scoresByRegistration = new Map();
  for (const score of scores) {
    const items = scoresByRegistration.get(score.registration_id) || [];
    items.push(score);
    scoresByRegistration.set(score.registration_id, items);
  }
  res.json({ program, judges, participants: participants.map(p => ({
    ...p,
    average_score: p.average_score == null ? null : Math.round(p.average_score * 100) / 100,
    scores: (scoresByRegistration.get(p.registration_id) || []).map(score => ({
      ...score, active: p.assigned_judge_ids.includes(Number(score.judge_id))
    }))
  })) });
});

// Save the organizer's medal places for a program. Unselected participants are ranked by average score after 3rd place.
router.put('/:programId/placements', requireRole('organizer'), (req, res) => {
  const program = db.prepare('SELECT id, results_published FROM programs WHERE id = ?').get(req.params.programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const placements = req.body?.placements;
  const suppliedPoints = req.body?.team_points;
  let teamPoints = null;
  if (suppliedPoints !== undefined) {
    if (!suppliedPoints || typeof suppliedPoints !== 'object' || Array.isArray(suppliedPoints)) {
      return res.status(400).json({ error: 'team_points must contain organizer-entered points for places 1, 2 and 3' });
    }
    teamPoints = {};
    for (const place of [1, 2, 3]) {
      const value = suppliedPoints[place];
      if (value == null || value === '') teamPoints[place] = null;
      else if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 10000) {
        return res.status(400).json({ error: 'Points must be whole numbers from 0 to 10000, or blank' });
      } else teamPoints[place] = Number(value);
    }
  }
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

  for (const item of placements) {
    const registrationId = Number(item.registration_id);
    const participant = db.prepare('SELECT id FROM registrations WHERE id = ? AND program_id = ?').get(registrationId, program.id);
    if (!participant) return res.status(400).json({ error: 'A selected participant does not belong to this program' });
    if (!assignedJudgeIds(registrationId).length || !activeScores(registrationId).length) {
      return res.status(409).json({ error: 'A participant needs at least one current assigned-judge score before receiving a draft place' });
    }
  }

  const save = db.transaction(() => {
    db.prepare('UPDATE registrations SET result_place = NULL WHERE program_id = ?').run(program.id);
    const update = db.prepare('UPDATE registrations SET result_place = ? WHERE id = ? AND program_id = ?');
    placements.forEach(item => update.run(Number(item.place), Number(item.registration_id), program.id));
    if (teamPoints) {
      db.prepare(`UPDATE programs SET first_place_points = ?, second_place_points = ?, third_place_points = ? WHERE id = ?`)
        .run(teamPoints[1], teamPoints[2], teamPoints[3], program.id);
    }
  });
  try { save(); }
  catch { return res.status(409).json({ error: 'Places could not be saved. Refresh and try again.' }); }
  recordAudit(req, 'set_placements', 'program', program.id, { placements, team_points: teamPoints });
  if (program.results_published) req.app.get('io').emit('results:published', { program_id: program.id, updated: true });
  res.json({ ok: true, placements: placements.length });
});

// Unpublished standings are available to organizers for review only.
router.get('/:programId', requireRole('organizer'), (req, res) => {
  const program = db.prepare('SELECT id FROM programs WHERE id = ?').get(req.params.programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  res.json(computeRankings(req.params.programId));
});

// Certificate PDF for a placed participant (1st/2nd/3rd), with the festival's branded template.
router.get('/:programId/certificate/:registrationId', requireRole('organizer'), (req, res) => {
  const { programId, registrationId } = req.params;
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  if (!program.results_published) return res.status(403).json({ error: 'Certificates are available after results are published' });
  const { ranked } = computeRankings(programId, true);
  const entry = ranked.find(r => String(r.registration_id) === String(registrationId));
  if (!entry || entry.rank > 3) return res.status(404).json({ error: 'No certificate available (not placed 1st-3rd)' });

  const placeLabel = { 1: '1st Place', 2: '2nd Place', 3: '3rd Place' }[entry.rank];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${entry.participant_id}.pdf"`);

  const doc = new PDFDocument({ layout: 'landscape', size: 'A4' });
  doc.pipe(res);
  const { width, height } = doc.page;
  const colors = { deep: '#073522', green: '#0b5734', lime: '#d9f36a', pale: '#e4f1df', muted: '#b8d3c0', white: '#ffffff' };
  doc.rect(0, 0, width, height).fill(colors.deep);
  doc.save().fillColor('#0b5734').circle(width - 25, 25, 160).fill().restore();
  doc.save().fillColor('#086144').circle(30, height - 20, 125).fill().restore();
  doc.lineWidth(2).strokeColor('#80aa55').rect(18, 18, width - 36, height - 36).stroke();
  doc.lineWidth(0.8).strokeColor('#ffffff').opacity(0.22).rect(26, 26, width - 52, height - 52).stroke().opacity(1);

  const brandDir = path.join(__dirname, '..', 'certificate-assets');
  const logoFiles = ['jmn-logo.png', 'ndsu-logo.png', 'logo-mark.png'];
  const logoBoxY = 38;
  const logoBoxW = 72;
  const logoBoxH = 58;
  const gap = 14;
  const totalLogoWidth = logoBoxW * logoFiles.length + gap * (logoFiles.length - 1);
  let logoX = (width - totalLogoWidth) / 2;
  for (const file of logoFiles) {
    const imagePath = path.join(brandDir, file);
    if (!fs.existsSync(imagePath)) { logoX += logoBoxW + gap; continue; }
    doc.image(imagePath, logoX + 7, logoBoxY + 6, { fit: [logoBoxW - 14, logoBoxH - 12], align: 'center', valign: 'center' });
    logoX += logoBoxW + gap;
  }

  doc.fillColor(colors.lime).font('Helvetica-Bold').fontSize(10)
    .text("RENDEZVOUS '26 · MARKAZUNNAJATH FESTIVAL", 0, 111, { align: 'center', characterSpacing: 1.4 });
  doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(28)
    .text('CERTIFICATE OF ACHIEVEMENT', 50, 145, { width: width - 100, align: 'center', characterSpacing: 1.1 });
  doc.fillColor(colors.muted).font('Helvetica').fontSize(12)
    .text('This certificate is proudly presented to', 0, 193, { align: 'center' });
  doc.fillColor(colors.lime).font('Helvetica-Bold').fontSize(17)
    .text(placeLabel.toUpperCase(), 0, 222, { align: 'center', characterSpacing: 1 });

  doc.save().lineWidth(1.2).strokeColor('#91b85c').moveTo(125, 252).lineTo(width - 125, 252).stroke().restore();
  doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(29)
    .text(entry.student_name, 55, 269, { width: width - 110, align: 'center', ellipsis: true });
  if (entry.is_team && entry.team_members) {
    doc.fillColor(colors.pale).font('Helvetica').fontSize(10)
      .text(`Team members: ${entry.team_members}`, 65, 308, { width: width - 130, align: 'center', ellipsis: true });
  }
  const programLine = `Program: ${program.name}${program.category ? ` (${program.category[0].toUpperCase() + program.category.slice(1)})` : ''}`;
  doc.fillColor(colors.pale).font('Helvetica').fontSize(12)
    .text(programLine, 45, entry.is_team && entry.team_members ? 329 : 318, { width: width - 90, align: 'center', ellipsis: true });
  doc.fillColor(colors.muted).font('Helvetica').fontSize(9)
    .text(`Participant code: ${entry.code_letter}   ·   ID: ${entry.participant_id}`, 0, 350, { align: 'center' });

  const footerPath = path.join(brandDir, 'footer-white.png');
  if (fs.existsSync(footerPath)) {
    const footerWidth = 300;
    doc.image(footerPath, (width - footerWidth) / 2, height - 53, { fit: [footerWidth, 32], align: 'center', valign: 'center' });
  }
  doc.end();
});

module.exports = router;
