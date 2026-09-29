// Official Rendezvous'26 program lists. Numbers are the festival's program numbers.
// Premier: stage 28-41, written 42-59. Junior: stage 96-120, written 121-161.
// Qawwali and Group Song are general, unnumbered stage programs. Seeded once (see db.js);
// after that the admin owns the list and can add / edit / delete freely.

const PREMIER = [
  [42, 'Essay Malayalam'], [43, 'Essay English'], [44, 'Story Malayalam'], [45, 'Story English'],
  [46, 'Poem Malayalam'], [47, 'Poem English'], [48, 'LetterVerse'], [49, 'Pygmy Poem Arabic'],
  [50, 'Book Test'], [51, 'Written Translation Eng-Mal'], [52, 'Vocabulary Arabic'],
  [53, 'Watercoloring'], [54, 'Cartoon Scape'], [55, 'Caption Writing'], [56, 'Imla’'],
  [57, 'Handwriting English'], [58, 'Sudoku'], [59, 'Magazine']
];

const JUNIOR = [
  [121, 'Poem Malayalam'], [122, 'Poem English'], [123, 'Poem Arabic'], [124, 'Poem Urdu'],
  [125, 'Story Malayalam'], [126, 'Story English'], [127, 'Story Arabic'], [128, 'Story Urdu'],
  [129, 'Essay Malayalam'], [130, 'Essay English'], [131, 'Essay Arabic'], [132, 'Essay Urdu'],
  [133, 'Feature Writing'], [134, 'Madh Song Writing'], [135, 'Social Tweet English'],
  [136, 'Philosophical Slice'], [137, 'Risala Creation (Book Writing Arabic)'],
  [138, 'Abstract Writing English'], [139, 'Balaga Test'], [140, 'Book Criticism'],
  [141, 'Book Review'], [142, 'Sharhul Muthoon'], [143, 'Kithabic Test'], [144, 'Book Test'],
  [145, 'Talent Test'], [146, 'Fiqh Translation Ara-Eng'], [147, 'Written Translation Arabi-Mal'],
  [148, 'Written Translation Mal-Urd'], [149, 'Prompt Creation'], [150, 'Digital Drawing'],
  [151, 'Photography'], [152, 'Reel Creation'], [153, 'Calligraffiti'], [154, 'Project'],
  [155, 'Documentary Presentation'], [156, 'Shoot Out'], [157, 'Swimming'], [158, 'Data Story'],
  [159, 'Collage'], [160, 'Slogan Writing'], [161, 'Translation Critique']
];

const PREMIER_STAGE = [
  [28, 'Tarteel'], [29, 'Elocution Malayalam'], [30, 'Elocution Arabic'], [31, 'Devotional Song'],
  [32, 'Talk Master English'], [33, 'Nasheeda'], [34, 'Paper Presentation English'], [35, 'Quiz'],
  [36, 'Nahv Test'], [37, 'Swarf Test'], [38, 'Ibarath Reading'], [39, 'Hifzul Muthoon'],
  [40, "Hifzul Qur'an"], [41, 'Extempore']
];

const JUNIOR_STAGE = [
  [96, 'ThinkTank'], [97, 'Tarteel'], [98, 'Elocution Malayalam'], [99, 'TED Talk'],
  [100, 'Jalsa Arabic (Elocution Arb)'], [101, 'Elocution Urd'], [102, "Va'alu"],
  [103, 'Arabic Kathaprasangam'], [104, 'Spoken Translation Mal-Arb'], [105, 'Spoken Translation Mal-Eng'],
  [106, 'Eco Pitch'], [107, 'Gazal'], [108, 'Mappilappattu'], [109, 'Campus Song'], [110, 'Colloquium'],
  [111, 'Hadees Musabaqa'], [112, 'Quiz'], [113, 'Alfiya Test'],
  [114, 'Research Poster Presentation (Paper Presentation)'], [115, 'News Reporting (Reading)'],
  [116, 'Ibarath Reading'], [117, "Qur'an Mastery"], [118, 'Hifzul Muthoon'], [119, 'Thadrees'], [120, "Musha'ara"]
];

const GENERAL_STAGE = [
  { name: 'Qawwali', code: 'QWL' },
  { name: 'Group Song', code: 'GSO' }
];

const CODE_LETTER_OPTIONS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').flatMap(first => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(second => `${first}${second}`))
];

// Programs performed/shown live are "stage"; everything else is judged from a submission.
const STAGE_NAMES = new Set(['Swimming', 'Shoot Out', 'Documentary Presentation', 'Talent Test']);
const LANGS = ['Malayalam', 'English', 'Arabic', 'Urdu'];

// If the name mentions exactly one language ("Essay Malayalam"), that is the program's language.
function languageOf(name) {
  const hits = LANGS.filter(l => new RegExp(`\\b${l}\\b`, 'i').test(name));
  return hits.length === 1 ? hits[0] : null;
}

// Each batch has its own marker in `meta`, so already-running databases only receive the
// batches they haven't had yet, and programs the admin later deletes never come back.
function seedBatch(db, key, batches, typeOf) {
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(key)) return;
  const insert = db.prepare(`INSERT OR IGNORE INTO programs (name, code, type, language, category, number)
    VALUES (?,?,?,?,?,?)`);
  db.transaction(() => {
    for (const [category, list, prefix] of batches) {
      for (const [number, name] of list) {
        insert.run(name, `${prefix}${number}`, typeOf(name), languageOf(name), category, number);
      }
    }
    db.prepare("INSERT INTO meta (key, value) VALUES (?, datetime('now'))").run(key);
  })();
}

function seedPrograms(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  seedBatch(db, 'programs_seeded_v1', [['premier', PREMIER, 'P'], ['junior', JUNIOR, 'J']],
    (name) => (STAGE_NAMES.has(name) ? 'stage' : 'writing'));
  seedBatch(db, 'programs_seeded_v2_stage', [['premier', PREMIER_STAGE, 'P'], ['junior', JUNIOR_STAGE, 'J']],
    () => 'stage');
  seedGeneralStagePrograms(db);
  consolidateGeneralStagePrograms(db);
}

function seedGeneralStagePrograms(db) {
  const key = 'programs_seeded_v4_general_stage';
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(key)) return;
  const ensure = db.prepare(`INSERT INTO programs (name, code, type, language, category, number)
    SELECT ?, ?, 'stage', NULL, NULL, NULL
    WHERE NOT EXISTS (SELECT 1 FROM programs WHERE lower(trim(name)) = lower(?) AND category IS NULL)`);
  db.transaction(() => {
    for (const program of GENERAL_STAGE) ensure.run(program.name, program.code, program.name);
    db.prepare("INSERT INTO meta (key, value) VALUES (?, datetime('now'))").run(key);
  })();
}

function consolidateGeneralStagePrograms(db) {
  const key = 'programs_consolidated_general_stage_v5';
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(key)) return;

  const participantExists = db.prepare('SELECT 1 FROM registrations WHERE participant_id = ? AND id != ?');
  const snapshotProgramPanel = db.prepare('INSERT OR IGNORE INTO registration_judge_panels (registration_id) VALUES (?)');
  const addRegistrationJudge = db.prepare('INSERT OR IGNORE INTO registration_judges (registration_id, judge_id) VALUES (?, ?)');
  const addProgramJudge = db.prepare('INSERT OR IGNORE INTO program_judges (program_id, judge_id) VALUES (?, ?)');

  const merge = db.transaction(() => {
    for (const general of GENERAL_STAGE) {
      const programs = db.prepare(`SELECT * FROM programs
        WHERE lower(trim(name)) = lower(?) AND type = 'stage'
        ORDER BY CASE WHEN category IS NULL THEN 0 ELSE 1 END,
          CASE category WHEN 'premier' THEN 0 WHEN 'junior' THEN 1 ELSE 2 END, id`).all(general.name);
      if (!programs.length) continue;

      const target = programs[0];
      const sourceIds = programs.slice(1).map(program => program.id);
      const programIds = programs.map(program => program.id);
      const placeholders = programIds.map(() => '?').join(',');
      const judgeIds = [...new Set(programIds.flatMap(programId =>
        db.prepare('SELECT judge_id FROM program_judges WHERE program_id = ?').all(programId).map(row => row.judge_id)))];

      // Freeze each inherited panel before combining the program-level judge lists.
      // This keeps each student's assigned panel and judging progress intact.
      for (const program of programs) {
        const defaults = db.prepare('SELECT judge_id FROM program_judges WHERE program_id = ?').all(program.id).map(row => row.judge_id);
        const inherited = db.prepare(`SELECT r.id FROM registrations r
          LEFT JOIN registration_judge_panels panel ON panel.registration_id = r.id
          WHERE r.program_id = ? AND panel.registration_id IS NULL`).all(program.id);
        for (const registration of inherited) {
          snapshotProgramPanel.run(registration.id);
          for (const judgeId of defaults) addRegistrationJudge.run(registration.id, judgeId);
        }
      }

      const slots = [...new Set(programs.map(program => program.time_slot || ''))];
      const quotas = programs.map(program => program.quota);
      const quota = quotas.some(value => value == null) ? null : quotas.reduce((sum, value) => sum + value, 0);
      const anyPublished = programs.some(program => !!program.results_published);
      const registrations = db.prepare(`SELECT id, program_id, code_letter, participant_id, created_at
        FROM registrations WHERE program_id IN (${placeholders})
        ORDER BY CASE WHEN program_id = ? THEN 0 ELSE 1 END, created_at, id`).all(...programIds, target.id);

      // Result places and team points belonged to separate category contests. Clear
      // the combined podium for organizer review while retaining every scorecard.
      if (programs.length > 1) {
        db.prepare(`UPDATE registrations SET result_place = NULL WHERE program_id IN (${placeholders})`).run(...programIds);
      }

      const usedLetters = new Set();
      let sequence = 1;
      const nextParticipantId = (letter, registrationId) => {
        let candidate;
        do {
          candidate = `FEST-${general.code}-${String(sequence++).padStart(3, '0')}-${letter}`;
        } while (participantExists.get(candidate, registrationId));
        return candidate;
      };

      const moveRegistration = db.prepare('UPDATE registrations SET program_id = ?, code_letter = ?, participant_id = ? WHERE id = ?');
      for (const registration of registrations) {
        let codeLetter = registration.code_letter;
        if (usedLetters.has(codeLetter)) codeLetter = CODE_LETTER_OPTIONS.find(letter => !usedLetters.has(letter));
        if (!codeLetter) throw new Error(`No unique performance code is available while consolidating ${general.name}.`);
        usedLetters.add(codeLetter);
        let participantId = registration.participant_id;
        if (codeLetter !== registration.code_letter) participantId = nextParticipantId(codeLetter, registration.id);
        moveRegistration.run(target.id, codeLetter, participantId, registration.id);
      }

      // Keep every judge available on the unified program. Student-specific panels
      // have already been snapshotted above and therefore do not silently widen.
      for (const judgeId of judgeIds) addProgramJudge.run(target.id, judgeId);
      if (programs.length > 1) {
        db.prepare(`UPDATE programs SET name = ?, code = ?, type = 'stage', language = NULL,
          category = NULL, number = NULL, time_slot = ?, quota = ?, first_place_points = NULL,
          second_place_points = NULL, third_place_points = NULL, results_published = 0, published_at = NULL
          WHERE id = ?`).run(general.name, general.code, slots.length === 1 ? (slots[0] || null) : null, quota, target.id);
      } else {
        db.prepare(`UPDATE programs SET name = ?, code = ?, type = 'stage', language = NULL,
          category = NULL, number = NULL WHERE id = ?`).run(general.name, general.code, target.id);
      }

      if (sourceIds.length) {
        const deleteSource = db.prepare('DELETE FROM programs WHERE id = ?');
        sourceIds.forEach(id => deleteSource.run(id));
      }

      db.prepare(`INSERT INTO audit_log (actor, action, entity, entity_id, details)
        VALUES ('system migration', 'consolidate_general_program', 'program', ?, ?)`).run(String(target.id), JSON.stringify({
          program: general.name,
          merged_program_ids: sourceIds,
          registrations_preserved: registrations.length,
          result_places_reset: programs.length > 1,
          previously_published: anyPublished
        }));
    }
    db.prepare("INSERT INTO meta (key, value) VALUES (?, datetime('now'))").run(key);
  });

  merge();
}

module.exports = { seedPrograms, PREMIER, JUNIOR, PREMIER_STAGE, JUNIOR_STAGE };
