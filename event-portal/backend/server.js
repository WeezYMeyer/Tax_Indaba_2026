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
const supportRoutes = require('./routes/support');
const { router: tpSummitRoutes, resolveTpLead } = require('./routes/tpSummit');
const { autoReply } = require('./supportBot');
const { decrypt } = require('./passwordVault');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/tp-summit', tpSummitRoutes);
app.use('/api/support', supportRoutes);

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
  socket.rawToken = token;
  next();
});

io.on('connection', async (socket) => {
  const room = socket.handshake.auth?.room;
  if (room === 'tp-summit') return handleTpSummitConnection(socket);
  if (room === 'support-visitor') return handleSupportVisitorConnection(socket);
  if (room === 'support-admin') return handleSupportAdminConnection(socket);
  return handleDayConnection(socket);
});

// --- Support chat: the widget on every page, plus the /admin Support tab ---
async function handleSupportVisitorConnection(socket) {
  const conversationId = socket.user?.conversationId;
  if (!conversationId) {
    socket.disconnect(true);
    return;
  }
  socket.join(`support-${conversationId}`);

  socket.on('support:message', async (content) => {
    const text = String(content || '').trim().slice(0, 2000);
    if (!text) return;

    await pool.query(
      `INSERT INTO support_messages (conversation_id, sender, content) VALUES ($1, 'visitor', $2)`,
      [conversationId, text]
    );
    await pool.query(
      `UPDATE support_conversations SET last_message_at = NOW(), unread_by_admin = TRUE WHERE id = $1`,
      [conversationId]
    );

    const visitorMsg = { conversationId, sender: 'visitor', content: text, created_at: new Date().toISOString() };
    io.to(`support-${conversationId}`).emit('support:message', visitorMsg);
    io.to('support-admin').emit('support:update', { conversationId });

    // Personalise the canned reply using whatever attendee record (if any)
    // this conversation is linked to — including their actual current
    // password, so login trouble can be resolved on the spot instead of
    // the bot promising to "send a new one".
    let ctx = {
      matched: false,
      email: socket.user.email,
      name: socket.user.name,
      attendeeName: null,
      access: null,
      password: null,
      passwordAlreadyShared: false,
    };
    try {
      const { rows } = await pool.query(
        `SELECT u.name AS attendee_name, u.access_day1, u.access_day2, u.access_day3, u.password_encrypted,
                sc.password_shared
         FROM support_conversations sc LEFT JOIN users u ON u.id = sc.user_id
         WHERE sc.id = $1`,
        [conversationId]
      );
      const row = rows[0];
      if (row && row.access_day1 !== null) {
        ctx = {
          matched: true,
          email: socket.user.email,
          name: socket.user.name,
          attendeeName: row.attendee_name,
          access: { day1: row.access_day1, day2: row.access_day2, day3: row.access_day3 },
          password: row.password_encrypted ? decrypt(row.password_encrypted) : null,
          passwordAlreadyShared: Boolean(row.password_shared),
        };
      }
    } catch (err) {
      console.error('Failed to load support context', err);
    }

    const { text: replyText, revealedPassword } = autoReply(text, ctx);
    await pool.query(
      `INSERT INTO support_messages (conversation_id, sender, content) VALUES ($1, 'bot', $2)`,
      [conversationId, replyText]
    );
    if (revealedPassword) {
      await pool.query('UPDATE support_conversations SET password_shared = TRUE WHERE id = $1', [conversationId]);
    }
    const botMsg = { conversationId, sender: 'bot', content: replyText, created_at: new Date().toISOString() };
    io.to(`support-${conversationId}`).emit('support:message', botMsg);
    io.to('support-admin').emit('support:update', { conversationId });
  });
}

async function handleSupportAdminConnection(socket) {
  if (!socket.user?.isAdmin) {
    socket.disconnect(true);
    return;
  }
  socket.join('support-admin');

  // Admin opens a conversation in the Support tab — join its room so future
  // visitor/bot messages stream in live, and mark it as read.
  socket.on('support:watch', async ({ conversationId } = {}) => {
    if (!conversationId) return;
    socket.join(`support-${conversationId}`);
    await pool.query('UPDATE support_conversations SET unread_by_admin = FALSE WHERE id = $1', [conversationId]);
  });

  socket.on('support:reply', async ({ conversationId, content } = {}) => {
    const text = String(content || '').trim().slice(0, 2000);
    if (!text || !conversationId) return;

    await pool.query(
      `INSERT INTO support_messages (conversation_id, sender, content) VALUES ($1, 'admin', $2)`,
      [conversationId, text]
    );
    await pool.query(
      `UPDATE support_conversations SET last_message_at = NOW(), unread_by_admin = FALSE WHERE id = $1`,
      [conversationId]
    );

    const msg = { conversationId, sender: 'admin', content: text, created_at: new Date().toISOString() };
    io.to(`support-${conversationId}`).emit('support:message', msg);
    io.to('support-admin').emit('support:update', { conversationId });
  });

  // Mark a conversation resolved, or reopen one.
  socket.on('support:status', async ({ conversationId, status } = {}) => {
    if (!conversationId) return;
    const safeStatus = status === 'closed' ? 'closed' : 'open';
    await pool.query('UPDATE support_conversations SET status = $1 WHERE id = $2', [safeStatus, conversationId]);
    io.to('support-admin').emit('support:update', { conversationId });
  });
}

// --- TP Summit: separate free mini-event, own chat room + watch tracking ---
async function handleTpSummitConnection(socket) {
  const lead = await resolveTpLead(socket.rawToken);
  if (!lead) {
    socket.emit('access-denied', { message: 'Not authenticated for TP Summit.' });
    socket.disconnect(true);
    return;
  }

  socket.join('tp-summit');
  console.log(`${lead.email} connected to tp-summit`);

  let sessionId = null;
  try {
    const { rows } = await pool.query(
      'INSERT INTO tp_summit_sessions (lead_id) VALUES ($1) RETURNING id',
      [lead.id]
    );
    sessionId = rows[0].id;
  } catch (err) {
    console.error('Failed to start TP Summit session', err);
  }

  const { rows: history } = await pool.query(
    'SELECT username, content, created_at FROM tp_summit_messages ORDER BY created_at DESC LIMIT 50'
  );
  socket.emit('history', history.reverse());

  socket.on('chat:message', async (content) => {
    const text = String(content || '').trim().slice(0, 1000);
    if (!text) return;

    const username = lead.name || lead.email;
    await pool.query(
      'INSERT INTO tp_summit_messages (lead_id, username, content) VALUES ($1, $2, $3)',
      [lead.id, username, text]
    );
    io.to('tp-summit').emit('chat:message', { username, content: text, created_at: new Date().toISOString() });
  });

  socket.on('disconnect', async () => {
    console.log(`${lead.email} disconnected from tp-summit`);
    if (sessionId) {
      try {
        await pool.query(
          `UPDATE tp_summit_sessions
           SET ended_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
           WHERE id = $1`,
          [sessionId]
        );
      } catch (err) {
        console.error('Failed to close TP Summit session', err);
      }
    }
  });
}

// --- Day 1/2/3 chat (existing behavior, unchanged) ---
async function handleDayConnection(socket) {
  // Which day's chat room this connection belongs to (1, 2, or 3).
  // The frontend passes this when connecting, and reconnects with a new
  // value whenever the person switches day tabs.
  const day = ['1', '2', '3'].includes(String(socket.handshake.auth?.day)) ? String(socket.handshake.auth.day) : '1';
  const room = `day-${day}`;

  // Enforce per-day ticket access here too, not just on the stream API route —
  // otherwise someone could still read/send chat for a day their ticket
  // doesn't cover even if the video itself is blocked.
  if (socket.user.id !== 'admin') {
    const { rows: accessRows } = await pool.query(
      'SELECT access_day1, access_day2, access_day3 FROM users WHERE id = $1',
      [socket.user.id]
    );
    const access = accessRows[0];
    if (!access || !access[`access_day${day}`]) {
      socket.emit('access-denied', { day: Number(day), message: `Your ticket doesn't include access to Day ${day}.` });
      socket.disconnect(true);
      return;
    }
  }

  socket.join(room);

  console.log(`${socket.user.name || socket.user.email} connected to ${room}`);

  // Start an attendance session for this day, so we can report on watch
  // time later. Skipped for the admin's own connection (socket.user.id === 'admin').
  let sessionId = null;
  if (socket.user.id !== 'admin') {
    try {
      const { rows: sessionRows } = await pool.query(
        'INSERT INTO attendance_sessions (user_id, day) VALUES ($1, $2) RETURNING id',
        [socket.user.id, day]
      );
      sessionId = sessionRows[0].id;
    } catch (err) {
      console.error('Failed to start attendance session', err);
    }
  }

  // Send recent chat history for this day's room only
  const { rows } = await pool.query(
    'SELECT username, content, created_at FROM messages WHERE day = $1 ORDER BY created_at DESC LIMIT 50',
    [day]
  );
  socket.emit('history', rows.reverse());

  socket.on('chat:message', async (content) => {
    const text = String(content || '').trim().slice(0, 1000);
    if (!text) return;

    // Never show an email in chat — always the attendee's name, or a
    // generic fallback for the rare legacy account with no name on file.
    const username = socket.user.name || 'Attendee';
    await pool.query(
      'INSERT INTO messages (user_id, username, content, day) VALUES ($1, $2, $3, $4)',
      [socket.user.id === 'admin' ? null : socket.user.id, username, text, day]
    );

    io.to(room).emit('chat:message', { username, content: text, created_at: new Date().toISOString() });
  });

  socket.on('disconnect', async () => {
    console.log(`${socket.user.name || socket.user.email} disconnected from ${room}`);

    // Close out the attendance session with how long they were present.
    if (sessionId) {
      try {
        await pool.query(
          `UPDATE attendance_sessions
           SET ended_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
           WHERE id = $1`,
          [sessionId]
        );
      } catch (err) {
        console.error('Failed to close attendance session', err);
      }
    }
  });
}

const PORT = process.env.PORT || 4000;

initSchema()
  .then(() => {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
