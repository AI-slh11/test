const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

require('./adminAuth').ensureAdmin();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
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
  socket.on('join_program', (programId) => {
    socket.join(`program:${programId}`);
  });
  socket.on('leave_program', (programId) => {
    socket.leave(`program:${programId}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Festival API + realtime server listening on :${PORT}`));
