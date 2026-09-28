const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { sessionForToken, isAssignedJudge } = require('./sessionAuth');

require('./adminAuth').ensureAdmin();

const app = express();
const server = http.createServer(app);
const frontendOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOrigin = frontendOrigins.length ? frontendOrigins : '*';
const io = new Server(server, { cors: { origin: corsOrigin } });

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Make io available to routes via app locals
app.set('io', io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/registrations', require('./routes/registrations'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/results', require('./routes/results'));
app.use('/api/control', require('./routes/control'));   // hidden admin API (token protected)

app.get('/api/health', (req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  const session = sessionForToken(socket.handshake.auth?.token);
  if (session) setTimeout(() => socket.disconnect(true), Math.max(0, session.expires - Date.now()));
  socket.on('join_program', (programId) => {
    const user = sessionForToken(socket.handshake.auth?.token);
    if (user?.role === 'judge' && isAssignedJudge(user.id, programId)) socket.join(`program:${programId}`);
  });
  socket.on('leave_program', (programId) => {
    socket.leave(`program:${programId}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Festival API + realtime server listening on :${PORT}`));
