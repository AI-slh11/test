const express = require('express');
const router = express.Router();
const db = require('../db');
const { TEAMS } = require('../teams');
const { optionalAuth, requireRole, requireOrganizerOrControlAdmin, isAssignedJudge } = require('../sessionAuth');
const { assignmentConflict } = require('../judgeAssignments');
const { recordAudit } = require('../audit');
const { assignedJudgeIds, updateJudgingStatus } = require('../registrationJudges');

// 4 digits + 2-3 letters + 3 digits, e.g. 2023CSE001
const STUDENT_ID_RE = /^\d{4}[A-Z]{2,3}\d{3}$/;
const isGroupProgramName = name => /\b(qawwali|group\s+song|quiz|nasheeda?)\b/i.test(String(name || ''));
const INDIVIDUAL_STAGE_PROGRAM_FILTER = `lower(p.name) NOT LIKE '%qawwali%' AND lower(p.name) NOT LIKE '%group song%'
  AND lower(p.name) NOT LIKE '%quiz%' AND lower(p.name) NOT LIKE '%nasheed%'`;

const CODE_LETTER_RE = /^[A-Z]{1,2}$/;
const isPendingCode = (value) => String(value || '').startsWith('PENDING-');
const CODE_LETTER_OPTIONS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').flatMap(first => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(second => `${first}${second}`))
];

router.get('/available-letters', (req, res) => {
  const programId = Number(req.query.program_id);
  if (!Number.isInteger(programId) || programId < 1) return res.status(400).json({ error: 'program_id required' });
  const program = db.prepare('SELECT id FROM programs WHERE id = ?').get(programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  const taken = db.prepare('SELECT code_letter FROM registrations WHERE program_id = ?').all(programId).map(row => row.code_letter).filter(letter => !isPendingCode(letter));
  res.json({ taken, available: CODE_LETTER_OPTIONS.filter(letter => !taken.includes(letter)) });
});

// Resolve a group member by their Student ID for the public registration form.
router.get('/lookup-student/:studentId', (req, res) => {
  const studentId = String(req.params.studentId || '').trim().toUpperCase();
  if (!STUDENT_ID_RE.test(studentId)) return res.status(400).json({ error: 'Enter a valid Student ID first' });
  const student = db.prepare(`SELECT student_name, student_id, team_name FROM registrations
    WHERE student_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`).get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found. Enter their full name and Student ID.' });
  res.json(student);
});

router.get('/individual-stage-count/:studentId', (req, res) => {
  const studentId = String(req.params.studentId || '').trim().toUpperCase();
  if (!STUDENT_ID_RE.test(studentId)) return res.status(400).json({ error: 'Enter a valid Student ID first' });
  const count = db.prepare(`SELECT COUNT(DISTINCT p.id) AS count
    FROM registrations r JOIN programs p ON p.id = r.program_id
    WHERE r.student_id = ? AND r.is_team = 0 AND p.type = 'stage' AND ${INDIVIDUAL_STAGE_PROGRAM_FILTER}`).get(studentId).count;
  res.json({ count, limit: 5, remaining: Math.max(0, 5 - count) });
});

// Register a student for a program. Works identically for organizer on-site (Green Room)
// registration and public online self-registration; `source` distinguishes them.
router.post('/', optionalAuth, (req, res) => {
  const { program_id, student_name, student_id, is_team, team_members, team_roster: rawTeamRoster, language, source, team_name, team_leader_name, team_leader_id } = req.body;
  if (req.body?.team_leader_registration && req.user?.role !== 'organizer' && !req.admin) {
    return res.status(403).json({ error: 'Team leader roster registration must be submitted by an organizer' });
  }
  const requestedJudges = req.body?.judge_ids ?? [];
  if (!Array.isArray(requestedJudges) || requestedJudges.some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) {
    return res.status(400).json({ error: 'judge_ids must contain valid judge IDs' });
  }
  if (requestedJudges.length && req.user?.role !== 'organizer' && !req.admin) {
    return res.status(403).json({ error: 'Only organizers can assign judges during registration' });
  }
  if (!program_id || !student_name || !student_id) {
    return res.status(400).json({ error: 'program_id, student_name, student_id required' });
  }
  if (!TEAMS.includes(team_name)) {
    return res.status(400).json({ error: `Please choose a team: ${TEAMS.join(' or ')}` });
  }
  if ((team_leader_name || team_leader_id)
    && (!String(team_leader_name || '').trim() || !STUDENT_ID_RE.test(String(team_leader_id || '').trim().toUpperCase()))) {
    return res.status(400).json({ error: 'Team leader name and a valid team leader Student ID are both required' });
  }
  const studentId = String(student_id).trim().toUpperCase();
  if (!STUDENT_ID_RE.test(studentId)) {
    return res.status(400).json({ error: 'Invalid Student ID. Format: 4 digits, 2-3 letters, 3 digits (e.g. 2023CSE001)' });
  }
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(program_id);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  if (program.results_published) return res.status(409).json({ error: 'Unpublish this program before registering students or changing its panel' });
  const requiredGroupProgram = isGroupProgramName(program.name);
  const groupEntry = !!is_team || requiredGroupProgram;
  let teamRoster = [];
  if (groupEntry) {
    if (rawTeamRoster !== undefined && !Array.isArray(rawTeamRoster)) return res.status(400).json({ error: 'Group members must be a list of students' });
    const submittedRoster = Array.isArray(rawTeamRoster) ? rawTeamRoster : [];
    if (submittedRoster.length > 24) return res.status(400).json({ error: 'A group can include up to 25 students including the registrant' });
    if (requiredGroupProgram && submittedRoster.length < 1 && !String(team_members || '').trim()) {
      return res.status(400).json({ error: `${program.name} is a group program. Add at least one other performer.` });
    }
    const seenIds = new Set([studentId]);
    for (const member of submittedRoster) {
      const memberId = String(member?.student_id || '').trim().toUpperCase();
      if (!STUDENT_ID_RE.test(memberId)) return res.status(400).json({ error: 'Enter a valid Student ID for every group member' });
      if (seenIds.has(memberId)) return res.status(409).json({ error: `Student ID ${memberId} is listed more than once in this group` });
      seenIds.add(memberId);
      const existingStudent = db.prepare(`SELECT student_name, student_id FROM registrations
        WHERE student_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`).get(memberId);
      const memberName = existingStudent?.student_name || String(member?.student_name || '').trim();
      if (!memberName) return res.status(400).json({ error: `Student ${memberId} is not registered yet. Enter their full name and Student ID.` });
      teamRoster.push({ student_name: memberName, student_id: memberId, found: !!existingStudent });
    }
  }
  const judgeIds = [...new Set(requestedJudges.map(Number))];
  for (const judgeId of judgeIds) {
    const conflict = assignmentConflict(program_id, judgeId);
    if (conflict) return res.status(conflict === 'Program not found' ? 404 : 409).json({ error: conflict });
  }

  const duplicate = db.prepare('SELECT id FROM registrations WHERE program_id = ? AND student_id = ?').get(program_id, studentId);
  if (duplicate) return res.status(409).json({ error: 'This Student ID is already registered for this program' });
  if (!groupEntry && program.type === 'stage') {
    const stageCount = db.prepare(`SELECT COUNT(DISTINCT p.id) AS count
      FROM registrations r JOIN programs p ON p.id = r.program_id
      WHERE r.student_id = ? AND r.is_team = 0 AND p.type = 'stage' AND ${INDIVIDUAL_STAGE_PROGRAM_FILTER}`).get(studentId).count;
    if (stageCount >= 5) {
      return res.status(409).json({ error: 'Each student may register for a maximum of 5 Stage programs individually. This Student ID has already reached that limit. Group entries do not count toward the individual limit.' });
    }
  }
  const existingCount = db.prepare('SELECT COUNT(*) c FROM registrations WHERE program_id = ?').get(program_id).c;
  if (program.quota && existingCount >= program.quota) {
    return res.status(409).json({ error: `Registration closed — this program is full (${program.quota} spots)` });
  }
  const pendingCode = `PENDING-${require('crypto').randomBytes(8).toString('hex').toUpperCase()}`;
  const pendingParticipantId = `FEST-${program.code}-${pendingCode}`;

  const register = db.transaction(() => {
    const info = db.prepare(`
    INSERT INTO registrations (program_id, student_name, student_id, is_team, team_members, language, code_letter, participant_id, source, team_name, team_leader_name, team_leader_id, team_roster)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      program_id, student_name.trim(), studentId, groupEntry ? 1 : 0, teamRoster.length ? teamRoster.map(member => member.student_name).join(', ') : (team_members || null),
      language || program.language || null, pendingCode, pendingParticipantId, source === 'onsite' ? 'onsite' : 'online', team_name,
      team_leader_name ? String(team_leader_name).trim().slice(0, 120) : null,
      team_leader_id ? String(team_leader_id).trim().toUpperCase().slice(0, 12) : null,
      teamRoster.length ? JSON.stringify(teamRoster) : null
    );
    const currentProgramJudges = db.prepare('SELECT judge_id FROM program_judges WHERE program_id = ?').all(program_id).map(row => row.judge_id);
    const addedProgramJudges = judgeIds.filter(judgeId => !currentProgramJudges.includes(judgeId));
    if (addedProgramJudges.length) {
      const snapshot = db.prepare(`SELECT r.id FROM registrations r LEFT JOIN registration_judge_panels rjp ON rjp.registration_id = r.id
        WHERE r.program_id = ? AND r.id != ? AND rjp.registration_id IS NULL`).all(program_id, info.lastInsertRowid);
      const markCustom = db.prepare('INSERT OR IGNORE INTO registration_judge_panels (registration_id) VALUES (?)');
      const keepExisting = db.prepare('INSERT OR IGNORE INTO registration_judges (registration_id, judge_id) VALUES (?,?)');
      snapshot.forEach(row => {
        markCustom.run(row.id);
        currentProgramJudges.forEach(judgeId => keepExisting.run(row.id, judgeId));
      });
    }
    const addProgramJudge = db.prepare('INSERT OR IGNORE INTO program_judges (program_id, judge_id) VALUES (?, ?)');
    addedProgramJudges.forEach(judgeId => addProgramJudge.run(program_id, judgeId));
    if (judgeIds.length) {
      db.prepare('INSERT INTO registration_judge_panels (registration_id) VALUES (?)').run(info.lastInsertRowid);
      const assignStudentJudge = db.prepare('INSERT INTO registration_judges (registration_id, judge_id) VALUES (?,?)');
      judgeIds.forEach(judgeId => assignStudentJudge.run(info.lastInsertRowid, judgeId));
    }
    return info;
  });
  let info;
  try { info = register(); }
  catch (error) {
    return res.status(409).json({ error: 'Registration could not be saved. Check duplicate student IDs and judge assignments.' });
  }

  const registration = db.prepare('SELECT * FROM registrations WHERE id = ?').get(info.lastInsertRowid);
  if (!req.user && !req.admin) req.auditActor = team_leader_id ? 'Team leader' : 'Student';
  const organizer = req.user?.role === 'organizer' || !!req.admin;
  recordAudit(req, 'register', 'registration', registration.id, { program_id, code_assignment_pending: true });

  // Real-time push to any judge portal open on this program (Green Room -> Judge Portal sync)
  const io = req.app.get('io');
  res.status(201).json({ registration: {
    id: registration.id, program_id: registration.program_id, student_name: registration.student_name,
    team_name: registration.team_name, code_letter: null, participant_id: null,
    ...(organizer ? { student_id: registration.student_id, source: registration.source } : {}),
    ...(teamRoster.length ? { team_roster: teamRoster } : {}),
    code_assignment_pending: true
  } });
});

// Organizer-managed roster import for team leaders; rows follow the standard registration fields.
router.post('/bulk', requireOrganizerOrControlAdmin, (req, res) => {
  const rows = req.body?.registrations;
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) return res.status(400).json({ error: 'Provide 1–500 registration rows' });
  const results = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const programId = Number(row.program_id);
    const studentId = String(row.student_id || '').trim().toUpperCase();
    if (!Number.isInteger(programId) || !STUDENT_ID_RE.test(studentId) || !String(row.student_name || '').trim() || !TEAMS.includes(row.team_name)) {
      results.push({ row: index + 1, error: 'Required fields: program_id, student_name, valid student_id, and team_name' }); continue;
    }
    const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(programId);
    if (!program || program.results_published) { results.push({ row: index + 1, error: !program ? 'Program not found' : 'Program results are published' }); continue; }
    if (db.prepare('SELECT 1 FROM registrations WHERE program_id = ? AND student_id = ?').get(programId, studentId)) { results.push({ row: index + 1, error: 'Duplicate Student ID for this program' }); continue; }
    const groupEntry = !!row.is_team || isGroupProgramName(program.name);
    if (isGroupProgramName(program.name) && !String(row.team_members || '').trim()) { results.push({ row: index + 1, error: `${program.name} is a group program; add the other performers' names` }); continue; }
    if (!groupEntry && program.type === 'stage') {
      const stageCount = db.prepare(`SELECT COUNT(DISTINCT p.id) AS count FROM registrations r JOIN programs p ON p.id = r.program_id
        WHERE r.student_id = ? AND r.is_team = 0 AND p.type = 'stage' AND ${INDIVIDUAL_STAGE_PROGRAM_FILTER}`).get(studentId).count;
      if (stageCount >= 5) { results.push({ row: index + 1, error: 'Student has reached the limit of 5 individual Stage programs' }); continue; }
    }
    const count = db.prepare('SELECT COUNT(*) c FROM registrations WHERE program_id = ?').get(programId).c;
    if (program.quota && count >= program.quota) { results.push({ row: index + 1, error: 'Program quota reached' }); continue; }
    const pendingCode = `PENDING-${require('crypto').randomBytes(8).toString('hex').toUpperCase()}`;
    const pendingParticipantId = `FEST-${program.code}-${pendingCode}`;
    try {
      const info = db.prepare(`INSERT INTO registrations (program_id, student_name, student_id, is_team, team_members, language, code_letter, participant_id, source, team_name)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(programId, String(row.student_name).trim(), studentId, groupEntry ? 1 : 0,
        row.team_members || null, row.language || program.language || null, pendingCode, pendingParticipantId, 'onsite', row.team_name);
      results.push({ row: index + 1, registration_id: info.lastInsertRowid, code_assignment_pending: true });
      recordAudit(req, 'bulk_register', 'registration', info.lastInsertRowid, { program_id: programId, code_assignment_pending: true });
    } catch { results.push({ row: index + 1, error: 'Could not save row; check duplicate fields' }); }
  }
  res.status(201).json({ created: results.filter(row => row.registration_id).length, results });
});

// Organizer / full view: includes student name & ID
router.get('/', requireOrganizerOrControlAdmin, (req, res) => {
  const { program_id } = req.query;
  const rows = program_id
    ? db.prepare('SELECT * FROM registrations WHERE program_id = ? ORDER BY length(code_letter), code_letter').all(program_id)
    : db.prepare('SELECT * FROM registrations ORDER BY created_at DESC').all();
  res.json(rows.map(row => ({
    ...row,
    team_roster: (() => { try { return row.team_roster ? JSON.parse(row.team_roster) : []; } catch { return []; } })(),
    code_letter: isPendingCode(row.code_letter) ? null : row.code_letter,
    participant_id: isPendingCode(row.code_letter) ? null : row.participant_id,
    code_assignment_pending: isPendingCode(row.code_letter),
    assigned_judge_ids: assignedJudgeIds(row.id),
    judge_panel_custom: !!db.prepare('SELECT 1 FROM registration_judge_panels WHERE registration_id = ?').get(row.id)
  })));
});

// Organizer assigns or changes a performance code after the student record exists.
router.put('/:id/code-letter', requireOrganizerOrControlAdmin, (req, res) => {
  const registration = db.prepare(`SELECT r.id, r.program_id, r.code_letter, r.participant_id,
      p.code AS program_code, p.results_published
    FROM registrations r JOIN programs p ON p.id = r.program_id WHERE r.id = ?`).get(req.params.id);
  if (!registration) return res.status(404).json({ error: 'Registration not found' });
  if (registration.results_published) return res.status(409).json({ error: 'Unpublish this program before assigning or changing a code letter' });
  const codeLetter = String(req.body?.code_letter || '').trim().toUpperCase();
  if (!CODE_LETTER_RE.test(codeLetter)) return res.status(400).json({ error: 'Choose a code letter from A to Z or AA to ZZ' });
  if (registration.code_letter === codeLetter) return res.json({ ok: true, code_letter: codeLetter, participant_id: registration.participant_id });
  const owner = db.prepare('SELECT id FROM registrations WHERE program_id = ? AND code_letter = ? AND id != ?')
    .get(registration.program_id, codeLetter, registration.id);
  if (owner) return res.status(409).json({ error: `Code letter ${codeLetter} is already assigned in this program` });

  const currentNumber = registration.participant_id.match(/-(\d+)-[A-Z]{1,2}$/)?.[1];
  let sequence = currentNumber ? Number(currentNumber) : 1;
  if (!currentNumber) {
    const usedNumbers = new Set(db.prepare('SELECT participant_id FROM registrations WHERE program_id = ?').all(registration.program_id)
      .map(row => row.participant_id.match(/-(\d+)-[A-Z]{1,2}$/)?.[1]).filter(Boolean).map(Number));
    while (usedNumbers.has(sequence)) sequence++;
  }
  let participantId = `FEST-${registration.program_code}-${String(sequence).padStart(3, '0')}-${codeLetter}`;
  while (db.prepare('SELECT 1 FROM registrations WHERE participant_id = ? AND id != ?').get(participantId, registration.id)) {
    participantId = `FEST-${registration.program_code}-${String(++sequence).padStart(3, '0')}-${codeLetter}`;
  }
  db.prepare('UPDATE registrations SET code_letter = ?, participant_id = ? WHERE id = ?')
    .run(codeLetter, participantId, registration.id);
  recordAudit(req, isPendingCode(registration.code_letter) ? 'assign_code_letter' : 'change_code_letter',
    'registration', registration.id, { previous_code: isPendingCode(registration.code_letter) ? null : registration.code_letter,
      code_letter: codeLetter, participant_id: participantId });
  req.app.get('io').to(`program:${registration.program_id}`).emit('registration:new', {
    id: registration.id, program_id: registration.program_id, code_letter: codeLetter,
    participant_id: participantId, code_assigned: true
  });
  res.json({ ok: true, code_letter: codeLetter, participant_id: participantId });
});

router.get('/:id/judges', requireOrganizerOrControlAdmin, (req, res) => {
  const registration = db.prepare('SELECT id, program_id FROM registrations WHERE id = ?').get(req.params.id);
  if (!registration) return res.status(404).json({ error: 'Registration not found' });
  const judges = db.prepare(`SELECT u.id, u.name, u.code FROM program_judges pj JOIN users u ON u.id = pj.judge_id
    WHERE pj.program_id = ? ORDER BY u.name`).all(registration.program_id);
  res.json({ assigned_judge_ids: assignedJudgeIds(registration.id), judges,
    custom_panel: !!db.prepare('SELECT 1 FROM registration_judge_panels WHERE registration_id = ?').get(registration.id) });
});

router.put('/:id/judges', requireOrganizerOrControlAdmin, (req, res) => {
  const registration = db.prepare(`SELECT r.id, r.program_id, p.results_published FROM registrations r
    JOIN programs p ON p.id = r.program_id WHERE r.id = ?`).get(req.params.id);
  if (!registration) return res.status(404).json({ error: 'Registration not found' });
  if (registration.results_published) return res.status(409).json({ error: 'Unpublish program results before changing a student panel' });
  const rawIds = req.body?.judge_ids;
  const previousIds = assignedJudgeIds(registration.id);
  if (req.body?.inherit_program_panel === true) {
    db.prepare('DELETE FROM registration_judge_panels WHERE registration_id = ?').run(registration.id);
    updateJudgingStatus(registration.id);
    const assignedIds = assignedJudgeIds(registration.id);
    recordAudit(req, 'reset_student_judges', 'registration', registration.id, { previous: previousIds, assigned: assignedIds });
    req.app.get('io').to(`program:${registration.program_id}`).emit('score:submitted', { registration_id: registration.id });
    return res.json({ ok: true, assigned_judge_ids: assignedIds, custom_panel: false });
  }
  if (!Array.isArray(rawIds) || !rawIds.length || rawIds.some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) {
    return res.status(400).json({ error: 'Assign at least one valid judge to this student' });
  }
  const judgeIds = [...new Set(rawIds.map(Number))];
  const programJudgeIds = new Set(db.prepare('SELECT judge_id FROM program_judges WHERE program_id = ?').all(registration.program_id).map(row => row.judge_id));
  if (judgeIds.some(id => !programJudgeIds.has(id))) {
    return res.status(400).json({ error: 'Student panels can only use judges already assigned to this program' });
  }
  try {
    const save = db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO registration_judge_panels (registration_id) VALUES (?)').run(registration.id);
      db.prepare('DELETE FROM registration_judges WHERE registration_id = ?').run(registration.id);
      const insert = db.prepare('INSERT INTO registration_judges (registration_id, judge_id) VALUES (?,?)');
      judgeIds.forEach(id => insert.run(registration.id, id));
    });
    save();
  } catch { return res.status(409).json({ error: 'The student panel could not be saved. Refresh and try again.' }); }
  updateJudgingStatus(registration.id);
  recordAudit(req, 'set_student_judges', 'registration', registration.id, { previous: previousIds, assigned: judgeIds });
  req.app.get('io').to(`program:${registration.program_id}`).emit('score:submitted', { registration_id: registration.id });
  res.json({ ok: true, assigned_judge_ids: judgeIds, previous_judge_ids: previousIds, custom_panel: true });
});

// Judge view: anonymized - code letter + status only, no student name/ID
router.get('/judge-view', requireRole('judge'), (req, res) => {
  const { program_id } = req.query;
  if (!program_id) return res.status(400).json({ error: 'program_id required' });
  if (!isAssignedJudge(req.user.id, program_id)) return res.status(403).json({ error: 'You are not assigned to this program' });
  const rows = db.prepare(`
    SELECT id, program_id, code_letter, participant_id, is_team, status, created_at
    FROM registrations WHERE program_id = ? AND code_letter NOT LIKE 'PENDING-%' ORDER BY length(code_letter), code_letter
  `).all(program_id).filter(row => assignedJudgeIds(row.id).some(id => Number(id) === Number(req.user.id)));
  res.json(rows);
});

router.get('/checkin/:participantId', requireOrganizerOrControlAdmin, (req, res) => {
  const row = db.prepare(`SELECT r.id, r.participant_id, r.student_name, r.student_id, r.team_members,
    p.name AS program, c.checked_in_at FROM registrations r JOIN programs p ON p.id = r.program_id
    LEFT JOIN checkins c ON c.registration_id = r.id WHERE r.participant_id = ?`).get(req.params.participantId);
  if (!row) return res.status(404).json({ error: 'Participant not found' });
  res.json({ registration: row, checked_in: !!row.checked_in_at });
});

router.post('/checkin/:participantId', requireOrganizerOrControlAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM registrations WHERE participant_id = ?').get(req.params.participantId);
  if (!row) return res.status(404).json({ error: 'Participant not found' });
  db.prepare('INSERT OR IGNORE INTO checkins (registration_id, checked_in_by) VALUES (?,?)').run(row.id, req.user?.code || req.admin?.code || 'organizer');
  const checkin = db.prepare('SELECT checked_in_at FROM checkins WHERE registration_id = ?').get(row.id);
  recordAudit(req, 'checkin', 'registration', row.id, { participant_id: req.params.participantId });
  res.json({ ok: true, checked_in_at: checkin.checked_in_at });
});

router.delete('/checkin/:participantId', requireOrganizerOrControlAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM registrations WHERE participant_id = ?').get(req.params.participantId);
  if (!row) return res.status(404).json({ error: 'Participant not found' });
  db.prepare('DELETE FROM checkins WHERE registration_id = ?').run(row.id);
  recordAudit(req, 'undo_checkin', 'registration', row.id, { participant_id: req.params.participantId });
  res.json({ ok: true });
});

router.patch('/:id/status', requireOrganizerOrControlAdmin, (req, res) => {
  const { status } = req.body;
  const valid = ['registered', 'submission_received', 'slot_assigned', 'judged', 'results_announced'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'invalid status' });
  db.prepare('UPDATE registrations SET status = ? WHERE id = ?').run(status, req.params.id);
  recordAudit(req, 'update_status', 'registration', req.params.id, { status });
  res.json({ ok: true });
});

// Admin: edit a registration's student and team details.
router.patch('/:id', requireOrganizerOrControlAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Registration not found' });
  const program = db.prepare('SELECT results_published, name, type FROM programs WHERE id = ?').get(cur.program_id);
  if (program?.results_published) return res.status(409).json({ error: 'Unpublish this program before editing registrations' });
  const b = req.body;
  if (b.student_name !== undefined && (typeof b.student_name !== 'string' || !b.student_name.trim())) {
    return res.status(400).json({ error: 'Student name is required' });
  }
  let studentId = cur.student_id;
  if (b.student_id !== undefined) {
    studentId = String(b.student_id).trim().toUpperCase();
    if (!STUDENT_ID_RE.test(studentId)) return res.status(400).json({ error: 'Invalid Student ID format' });
    const dup = db.prepare('SELECT id FROM registrations WHERE program_id = ? AND student_id = ? AND id != ?').get(cur.program_id, studentId, cur.id);
    if (dup) return res.status(409).json({ error: 'That Student ID is already registered for this program' });
  }
  // empty string = "leave as is" (older registrations may have no team yet)
  if (b.team_name && !TEAMS.includes(b.team_name)) return res.status(400).json({ error: 'Invalid team' });
  const nextIsTeam = isGroupProgramName(program?.name) || ('is_team' in b ? !!b.is_team : !!cur.is_team);
  if (!nextIsTeam && program?.type === 'stage') {
    const stageCount = db.prepare(`SELECT COUNT(DISTINCT p.id) AS count FROM registrations r JOIN programs p ON p.id = r.program_id
      WHERE r.student_id = ? AND r.id != ? AND r.is_team = 0 AND p.type = 'stage' AND ${INDIVIDUAL_STAGE_PROGRAM_FILTER}`).get(studentId, cur.id).count;
    if (stageCount >= 5) return res.status(409).json({ error: 'This student is already registered for 5 individual Stage programs.' });
  }
  db.prepare('UPDATE registrations SET student_name=?, student_id=?, is_team=?, team_members=?, language=?, team_name=? WHERE id=?').run(
    b.student_name !== undefined ? b.student_name.trim() : cur.student_name, studentId,
    nextIsTeam ? 1 : 0,
    'team_members' in b ? (b.team_members || null) : cur.team_members,
    'language' in b ? (b.language || null) : cur.language, b.team_name || cur.team_name, cur.id);
  recordAudit(req, 'edit', 'registration', cur.id, { student_name: b.student_name ?? cur.student_name, student_id: studentId });
  req.app.get('io').to(`program:${cur.program_id}`).emit('score:submitted', {});
  res.json({ ok: true });
});

router.delete('/:id', requireOrganizerOrControlAdmin, (req, res) => {
  const cur = db.prepare(`SELECT r.program_id, p.results_published FROM registrations r
    JOIN programs p ON p.id = r.program_id WHERE r.id = ?`).get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Registration not found' });
  if (cur.results_published) return res.status(409).json({ error: 'Unpublish this program before removing registrations' });
  db.prepare('DELETE FROM registrations WHERE id = ?').run(req.params.id);
  recordAudit(req, 'delete', 'registration', req.params.id, { program_id: cur.program_id });
  req.app.get('io').to(`program:${cur.program_id}`).emit('score:submitted', {});
  res.json({ ok: true });
});

module.exports = router;
