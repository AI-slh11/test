const Database = require('better-sqlite3');
const path = require('path');
const { hashPassword, verifyPassword, PREFIX } = require('./credentials');

const db = new Database(path.join(__dirname, 'data', 'festival.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,       -- login code, e.g. ORG-001 / JUDGE-2024-001
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('organizer','judge')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,              -- short code used in participant IDs, e.g. ESH, SNG
  type TEXT NOT NULL CHECK(type IN ('writing','stage')),
  language TEXT,                   -- only relevant for writing programs
  time_slot TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS program_judges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(program_id, judge_id)
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id TEXT NOT NULL,
  is_team INTEGER NOT NULL DEFAULT 0,
  team_members TEXT,               -- comma separated, only if is_team
  language TEXT,                   -- chosen language for writing programs
  code_letter TEXT NOT NULL,       -- organizer-assigned performance code; PENDING-* until assigned
  participant_id TEXT UNIQUE NOT NULL, -- FEST-[ProgramCode]-[RegNumber]-[CodeLetter]
  source TEXT NOT NULL CHECK(source IN ('online','onsite')) DEFAULT 'online',
  submission_file TEXT,            -- filename for writing submissions
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK(status IN ('registered','submission_received','slot_assigned','judged','results_announced')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registration_judge_panels (
  registration_id INTEGER PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registration_judges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(registration_id, judge_id)
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  judge_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
  grade TEXT NOT NULL,             -- A / B / C / D / F
  remarks TEXT,                    -- max 500 chars, enforced in route
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(registration_id, judge_id) -- one score per judge per participant, final once submitted
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkins (
  registration_id INTEGER PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
  checked_in_by TEXT NOT NULL,
  checked_in_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reg_program ON registrations(program_id);
CREATE INDEX IF NOT EXISTS idx_scores_reg ON scores(registration_id);
`);

// Migration: per-program registration quota (NULL = unlimited)
if (!db.prepare("PRAGMA table_info(programs)").all().some(c => c.name === 'quota')) {
  db.exec('ALTER TABLE programs ADD COLUMN quota INTEGER');
}

// Migration: team (Aliora / Nexiora) on registrations; publish state on programs
const hasCol = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
if (!hasCol('registrations', 'team_name')) db.exec('ALTER TABLE registrations ADD COLUMN team_name TEXT');
if (!hasCol('registrations', 'team_leader_name')) db.exec('ALTER TABLE registrations ADD COLUMN team_leader_name TEXT');
if (!hasCol('registrations', 'team_leader_id')) db.exec('ALTER TABLE registrations ADD COLUMN team_leader_id TEXT');
if (!hasCol('registrations', 'team_roster')) db.exec('ALTER TABLE registrations ADD COLUMN team_roster TEXT');
if (!hasCol('registrations', 'result_place')) {
  db.exec('ALTER TABLE registrations ADD COLUMN result_place INTEGER CHECK (result_place IS NULL OR result_place BETWEEN 1 AND 3)');
}
db.exec('DROP INDEX IF EXISTS idx_reg_program_result_place');
db.exec('DROP INDEX IF EXISTS idx_reg_program_code_letter');
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_program_assigned_code_letter ON registrations(program_id, code_letter) WHERE code_letter NOT LIKE 'PENDING-%'");
if (!hasCol('programs', 'results_published')) db.exec('ALTER TABLE programs ADD COLUMN results_published INTEGER NOT NULL DEFAULT 0');
if (!hasCol('programs', 'published_at')) db.exec('ALTER TABLE programs ADD COLUMN published_at TEXT');

// Migration: student category (premier / junior) + festival program number
if (!hasCol('programs', 'category')) db.exec('ALTER TABLE programs ADD COLUMN category TEXT');
if (!hasCol('programs', 'number')) db.exec('ALTER TABLE programs ADD COLUMN number INTEGER');
if (!hasCol('programs', 'first_place_points')) db.exec('ALTER TABLE programs ADD COLUMN first_place_points INTEGER');
if (!hasCol('programs', 'second_place_points')) db.exec('ALTER TABLE programs ADD COLUMN second_place_points INTEGER');
if (!hasCol('programs', 'third_place_points')) db.exec('ALTER TABLE programs ADD COLUMN third_place_points INTEGER');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_prog_cat_num ON programs(category, number)');

// Shared organizer-created public schedule.
db.exec(`CREATE TABLE IF NOT EXISTS schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  schedule_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  venue TEXT,
  notes TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`);
// Add a nullable category to existing schedule rows without rewriting them.
if (!hasCol('schedule_items', 'category')) db.exec('ALTER TABLE schedule_items ADD COLUMN category TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_schedule_public_order ON schedule_items(published, schedule_date, start_time, sort_order, id)');

// Hidden admin accounts (separate from organizer/judge users). Passwords are stored as scrypt hashes.
db.exec(`CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// Seed usable accounts. Production must supply private passwords through environment
// variables; the familiar development-only credentials are never accepted there.
const seedAccounts = [
  { code: 'ORG-001', passwordKey: 'SEED_ORGANIZER_PASSWORD', fallback: 'organizer123', name: 'Festival Organizer', role: 'organizer' },
  { code: 'JUDGE-2024-001', passwordKey: 'SEED_JUDGE_1_PASSWORD', fallback: 'judge123', name: 'Judge One', role: 'judge' },
  { code: 'JUDGE-2024-002', passwordKey: 'SEED_JUDGE_2_PASSWORD', fallback: 'judge123', name: 'Judge Two', role: 'judge' },
  { code: 'JUDGE-2024-003', passwordKey: 'SEED_JUDGE_3_PASSWORD', fallback: 'judge123', name: 'Judge Three', role: 'judge' }
];
const production = process.env.NODE_ENV === 'production';
if (production) {
  const missing = seedAccounts.filter(account => !process.env[account.passwordKey]).map(account => account.passwordKey);
  if (missing.length) throw new Error(`Production account passwords are missing: ${missing.join(', ')}`);
}

const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
const insertSeedAccount = db.prepare('INSERT INTO users (code, password, name, role) VALUES (?,?,?,?)');
const updateSeedPassword = db.prepare('UPDATE users SET password = ? WHERE id = ?');
for (const account of seedAccounts) {
  const configuredPassword = process.env[account.passwordKey];
  const password = configuredPassword || account.fallback;
  const existing = db.prepare('SELECT id, password FROM users WHERE code = ?').get(account.code);

  if (!existing) {
    insertSeedAccount.run(account.code, hashPassword(password), account.name, account.role);
    continue;
  }

  // Seed passwords are the configured source of truth so a recreated ephemeral
  // database accepts the same login. In development, keep user-changed passwords.
  if (configuredPassword) {
    const isLegacyDefault = existing.password === account.fallback
      || verifyPassword(account.fallback, existing.password);
    const matchesConfigured = verifyPassword(configuredPassword, existing.password);
    if (!production && !isLegacyDefault && !matchesConfigured) continue;
    if (!matchesConfigured) updateSeedPassword.run(hashPassword(configuredPassword), existing.id);
  }
}

// Upgrade legacy plaintext user passwords on existing installations.
const passwordRows = db.prepare('SELECT id, password FROM users').all();
const savePassword = db.prepare('UPDATE users SET password = ? WHERE id = ?');
for (const row of passwordRows) {
  if (!row.password.startsWith(PREFIX)) savePassword.run(hashPassword(row.password), row.id);
}

// Seed the official Premier / Junior program lists (once)
require('./programSeed').seedPrograms(db);

module.exports = db;
