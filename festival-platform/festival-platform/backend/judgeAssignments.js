const db = require('./db');

function assignmentConflictForSlot(judgeId, timeSlot, excludeProgramId = null) {
  const judge = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'judge'").get(judgeId);
  if (!judge) return 'Select a valid judge';
  if (!timeSlot?.trim()) return null;
  const conflict = db.prepare(`SELECT p.name FROM program_judges pj JOIN programs p ON p.id = pj.program_id
    WHERE pj.judge_id = ? AND pj.program_id != ? AND p.time_slot IS NOT NULL
      AND LOWER(TRIM(p.time_slot)) = LOWER(TRIM(?))
      AND (? IS NULL OR p.id != ?) LIMIT 1`).get(judgeId, excludeProgramId ?? -1, timeSlot, excludeProgramId, excludeProgramId);
  return conflict
    ? `${judge.name} is already assigned to ${conflict.name} at the same time slot (${timeSlot})`
    : null;
}

function assignmentConflict(programId, judgeId) {
  const program = db.prepare('SELECT id, name, time_slot, results_published FROM programs WHERE id = ?').get(programId);
  if (!program) return 'Program not found';
  if (program.results_published) return 'Unpublish this program before changing judge assignments';
  return assignmentConflictForSlot(judgeId, program.time_slot, program.id);
}

module.exports = { assignmentConflict, assignmentConflictForSlot };
