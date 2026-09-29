const db = require('./db');

function assignedJudgeIds(registrationId) {
  const hasCustomPanel = db.prepare('SELECT 1 FROM registration_judge_panels WHERE registration_id = ?').get(registrationId);
  if (hasCustomPanel) {
    return db.prepare('SELECT judge_id FROM registration_judges WHERE registration_id = ? ORDER BY judge_id')
      .all(registrationId).map(row => row.judge_id);
  }
  return db.prepare(`SELECT pj.judge_id FROM program_judges pj JOIN registrations r ON r.program_id = pj.program_id
    WHERE r.id = ? ORDER BY pj.judge_id`).all(registrationId).map(row => row.judge_id);
}

function activeScores(registrationId) {
  const judgeIds = assignedJudgeIds(registrationId);
  if (!judgeIds.length) return [];
  return db.prepare(`SELECT * FROM scores WHERE registration_id = ? AND judge_id IN (${judgeIds.map(() => '?').join(',')})`)
    .all(registrationId, ...judgeIds);
}

function isAssignedJudgeToRegistration(judgeId, registrationId) {
  return assignedJudgeIds(registrationId).some(id => Number(id) === Number(judgeId));
}

function registrationIsFullyScored(registrationId) {
  const assigned = assignedJudgeIds(registrationId);
  if (!assigned.length) return false;
  const submitted = new Set(activeScores(registrationId).map(score => Number(score.judge_id)));
  return assigned.every(id => submitted.has(Number(id)));
}

function updateJudgingStatus(registrationId) {
  const registration = db.prepare('SELECT status FROM registrations WHERE id = ?').get(registrationId);
  if (!registration || registration.status === 'results_announced') return;
  const next = registrationIsFullyScored(registrationId) ? 'judged'
    : registration.status === 'judged' ? 'slot_assigned' : registration.status;
  if (next !== registration.status) db.prepare('UPDATE registrations SET status = ? WHERE id = ?').run(next, registrationId);
}

module.exports = { assignedJudgeIds, activeScores, isAssignedJudgeToRegistration, registrationIsFullyScored, updateJudgingStatus };
