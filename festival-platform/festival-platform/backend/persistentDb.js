const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const sqlitePath = path.join(__dirname, 'data', 'festival.db');
const maxSnapshotBytes = 400 * 1024 * 1024;
let pool = null;
let lastPersistenceError = null;
let saveQueue = Promise.resolve();

async function initialize() {
  if (!databaseUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production so Render restarts cannot erase festival data.');
    }
    console.warn('DATABASE_URL is not set; using local SQLite without remote persistence.');
    return false;
  }

  pool = new Pool({ connectionString: databaseUrl, max: 1 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rendezvous_app_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      sqlite_snapshot BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT sqlite_snapshot FROM rendezvous_app_state WHERE id = 1');
  if (rows[0]?.sqlite_snapshot) {
    await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
    const tempPath = `${sqlitePath}.${randomUUID()}.restore`;
    await fs.writeFile(tempPath, rows[0].sqlite_snapshot, { mode: 0o600 });
    await fs.rm(`${sqlitePath}-wal`, { force: true });
    await fs.rm(`${sqlitePath}-shm`, { force: true });
    await fs.rename(tempPath, sqlitePath);
    console.log('Restored the SQLite database snapshot from Neon.');
  }
  return true;
}

async function saveSnapshot(db) {
  if (!pool) return;
  const save = async () => {
    const tempPath = path.join(os.tmpdir(), `rendezvous-${process.pid}-${randomUUID()}.db`);
    try {
      await db.backup(tempPath);
      const snapshot = await fs.readFile(tempPath);
      if (snapshot.byteLength > maxSnapshotBytes) {
        throw new Error(`SQLite snapshot exceeds the ${Math.round(maxSnapshotBytes / 1024 / 1024)} MB Neon safety limit.`);
      }
      await pool.query(`
        INSERT INTO rendezvous_app_state (id, sqlite_snapshot, updated_at)
        VALUES (1, $1, NOW())
        ON CONFLICT (id) DO UPDATE
        SET sqlite_snapshot = EXCLUDED.sqlite_snapshot, updated_at = EXCLUDED.updated_at
      `, [snapshot]);
      lastPersistenceError = null;
    } finally {
      await fs.rm(tempPath, { force: true });
    }
  };

  // Serialize uploads so overlapping edits cannot overwrite a newer snapshot.
  const result = saveQueue.then(save);
  saveQueue = result.catch((error) => {
    lastPersistenceError = error;
  });
  await result;
}

function attachWritePersistence(app, db) {
  app.use((req, res, next) => {
    if (!pool || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

    let persistenceStarted = false;
    let responseStarted = false;
    let insideOriginalSend = false;
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);

    const persistThen = async (sendResponse) => {
      if (responseStarted) return res;
      responseStarted = true;
      if (!persistenceStarted) {
        persistenceStarted = true;
        try {
          await saveSnapshot(db);
        } catch (error) {
          lastPersistenceError = error;
          console.error('Neon persistence failed; refusing the write response:', error.message);
          if (!res.headersSent) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return originalEnd(JSON.stringify({ error: 'The database could not save this change. Please retry when the service is available.' }));
          }
          return originalEnd();
        }
      }
      return sendResponse();
    };

    res.send = function (...args) {
      return persistThen(() => {
        insideOriginalSend = true;
        try { return originalSend(...args); }
        finally { insideOriginalSend = false; }
      });
    };
    res.end = function (...args) {
      if (insideOriginalSend) return originalEnd(...args);
      return persistThen(() => originalEnd(...args));
    };
    next();
  });
}

async function checkHealth() {
  if (!pool) return { persistent: false, database: 'local-only' };
  try {
    await pool.query('SELECT 1');
    return { persistent: true, database: 'neon' };
  } catch (error) {
    return { persistent: true, database: 'unavailable', error: error.message };
  }
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { initialize, saveSnapshot, attachWritePersistence, checkHealth, close };
