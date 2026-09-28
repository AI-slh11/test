// Official Rendezvous'26 program lists. Numbers are the festival's program numbers.
// Premier: stage 28-41, written 42-59.  Junior: stage 96-120, written 121-161. Seeded once on first run (see db.js);
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
}

module.exports = { seedPrograms, PREMIER, JUNIOR, PREMIER_STAGE, JUNIOR_STAGE };
