const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const persistence = require('./persistentDb');
let sessionAuth;

const app = express();
const server = http.createServer(app);
const frontendOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOrigin = frontendOrigins.length ? frontendOrigins : '*';
const io = new Server(server, { cors: { origin: corsOrigin } });

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Make io available to routes via app locals
app.set('io', io);

io.on('connection', (socket) => {
  const session = sessionAuth.sessionForToken(socket.handshake.auth?.token);
  if (session) setTimeout(() => socket.disconnect(true), Math.max(0, session.expires - Date.now()));
  socket.on('join_program', (programId) => {
    const user = sessionAuth.sessionForToken(socket.handshake.auth?.token);
    if (user?.role === 'judge' && sessionAuth.isAssignedJudge(user.id, programId)) socket.join(`program:${programId}`);
  });
  socket.on('leave_program', (programId) => {
    socket.leave(`program:${programId}`);
  });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await persistence.initialize();

  // Load the SQLite module only after restoring the latest snapshot from Neon.
  const db = require('./db');
  sessionAuth = require('./sessionAuth');
  require('./adminAuth').ensureAdmin();
  persistence.attachWritePersistence(app, db);

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/programs', require('./routes/programs'));
  app.use('/api/registrations', require('./routes/registrations'));
  app.use('/api/scores', require('./routes/scores'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/results', require('./routes/results'));
  app.use('/api/schedule', require('./routes/schedule'));
  app.use('/api/control', require('./routes/control'));   // hidden admin API (token protected)

  app.get('/api/health', async (req, res) => {
    const database = await persistence.checkHealth();
    const ok = database.database !== 'unavailable';
    res.status(ok ? 200 : 503).json({ ok, database });
  });

  // Seed the remote store on first boot, after schema, accounts, and programs exist.
  await persistence.saveSnapshot(db);

  server.listen(PORT, () => console.log(`Festival API + realtime server listening on :${PORT}`));
}

start().catch(async (error) => {
  console.error('Festival API startup failed:', error);
  await persistence.close().catch(() => {});
  process.exitCode = 1;
});
