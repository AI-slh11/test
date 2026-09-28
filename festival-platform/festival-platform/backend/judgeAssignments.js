const db = require('./db');

function assignmentConflict(programId, judgeId) {
  const program = db.prepare('SELECT id, name, time_slot, results_published FROM programs WHERE id = ?').get(programId);
  if (!program) return 'Program not found';
  if (program.results_published) return 'Unpublish this program before changing judge assignments';
  const judge = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'judge'").get(judgeId);
  if (!judge) return 'Select a valid judge';
  if (!program.time_slot?.trim()) return null;
  const conflict = db.prepare(`SELECT p.name FROM program_judges pj JOIN programs p ON p.id = pj.program_id
    WHERE pj.judge_id = ? AND pj.program_id != ? AND p.time_slot IS NOT NULL
      AND LOWER(TRIM(p.time_slot)) = LOWER(TRIM(?)) LIMIT 1`).get(judgeId, programId, program.time_slot);
  return conflict
    ? `${judge.name} is already assigned to ${conflict.name} at the same time slot (${program.time_slot})`
    : null;
}

module.exports = { assignmentConflict };
