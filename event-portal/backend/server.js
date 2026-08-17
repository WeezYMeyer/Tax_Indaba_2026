require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { pool, initSchema } = require('./db');
const { verifyToken } = require('./auth');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const streamRoutes = require('./routes/stream');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stream', streamRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the built React frontend (see frontend/README for the build step)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- Real-time chat, protected by the same JWT used for the REST API ---
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const payload = token && verifyToken(token);
  if (!payload) return next(new Error('Not authenticated'));
  socket.user = payload;
  next();
});

io.on('connection', async (socket) => {
  // Which day's chat room this connection belongs to (1, 2, or 3).
  // The frontend passes this when connecting, and reconnects with a new
  // value whenever the person switches day tabs.
  const day = ['1', '2', '3'].includes(String(socket.handshake.auth?.day)) ? String(socket.handshake.auth.day) : '1';
  const room = `day-${day}`;
  socket.join(room);

  console.log(`${socket.user.name || socket.user.email} connected to ${room}`);

  // Send recent chat history for this day's room only
  const { rows } = await pool.query(
    'SELECT username, content, created_at FROM messages WHERE day = $1 ORDER BY created_at DESC LIMIT 50',
    [day]
  );
  socket.emit('history', rows.reverse());

  socket.on('chat:message', async (content) => {
    const text = String(content || '').trim().slice(0, 1000);
    if (!text) return;

    const username = socket.user.name || socket.user.email;
    await pool.query(
      'INSERT INTO messages (user_id, username, content, day) VALUES ($1, $2, $3, $4)',
      [socket.user.id === 'admin' ? null : socket.user.id, username, text, day]
    );

    io.to(room).emit('chat:message', { username, content: text, created_at: new Date().toISOString() });
  });

  socket.on('disconnect', () => {
    console.log(`${socket.user.name || socket.user.email} disconnected from ${room}`);
  });
});

const PORT = process.env.PORT || 4000;

initSchema()
  .then(() => {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
