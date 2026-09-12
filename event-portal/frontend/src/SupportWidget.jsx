import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';

const NAME_KEY = 'supportName';
const EMAIL_KEY = 'supportEmail';

// The Support button + chat panel, mounted once for the whole app so it
// follows visitors across every page — including the public Login page,
// since "I can't log in" is exactly the kind of thing this needs to catch.
// First message from a new conversation always comes from the bot (see
// backend/supportBot.js): it checks the typed email against registered
// attendees and tries a canned answer before a human ever needs to reply.
export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState('gate'); // 'gate' | 'chat'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [hasUnseen, setHasUnseen] = useState(false);

  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;

  async function startConversation(n, e, opts = {}) {
    setError('');
    setStarting(true);
    try {
      const data = await api.supportStart(n, e);
      sessionStorage.setItem(NAME_KEY, n);
      sessionStorage.setItem(EMAIL_KEY, e);
      setMessages(data.messages || []);
      setStage('chat');
      connectSocket(data.token);
    } catch (err) {
      if (!opts.silent) setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  function connectSocket(token) {
    socketRef.current?.disconnect();
    const socket = io('/', { auth: { token, room: 'support-visitor' } });
    socketRef.current = socket;
    socket.on('support:message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (!openRef.current) setHasUnseen(true);
    });
  }

  // Resume a conversation already identified earlier this browser session
  // (e.g. after a page reload) without making them fill in the gate again.
  useEffect(() => {
    const savedName = sessionStorage.getItem(NAME_KEY);
    const savedEmail = sessionStorage.getItem(EMAIL_KEY);
    if (savedName && savedEmail) {
      setName(savedName);
      setEmail(savedEmail);
      startConversation(savedName, savedEmail, { silent: true });
    }
    return () => socketRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) {
      setHasUnseen(false);
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [open, messages]);

  function handleGateSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Please fill in both fields.');
      return;
    }
    startConversation(name.trim(), email.trim());
  }

  function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('support:message', text);
    setDraft('');
  }

  function senderLabel(sender) {
    if (sender === 'visitor') return 'You';
    if (sender === 'admin') return 'Support';
    return 'Tax Indaba Bot';
  }

  return (
    <div className="support-widget">
      {open && (
        <div className="support-panel">
          <div className="support-panel-header">
            <span>Support</span>
            <button type="button" className="support-close" onClick={() => setOpen(false)} aria-label="Close support chat">×</button>
          </div>

          {stage === 'gate' ? (
            <form className="support-gate" onSubmit={handleGateSubmit}>
              <p className="support-intro">
                Tell us who you are and we'll get you sorted — logins, streaming, tickets, anything.
              </p>
              {error && <div className="error-msg">{error}</div>}
              <div className="field">
                <label>Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              <div className="field">
                <label>Registered email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={starting}>
                {starting ? 'Starting…' : 'Start chat'}
              </button>
            </form>
          ) : (
            <>
              <div className="support-scroll" ref={scrollRef}>
                {messages.map((m, i) => (
                  <div className={`support-msg support-msg-${m.sender}`} key={i}>
                    <div className="who">{senderLabel(m.sender)}</div>
                    <div className="body">{m.content}</div>
                  </div>
                ))}
              </div>
              <form className="support-input-row" onSubmit={handleSend}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" />
                <button className="btn btn-primary">Send</button>
              </form>
            </>
          )}
        </div>
      )}

      <button type="button" className="support-fab" onClick={() => setOpen((o) => !o)}>
        {hasUnseen && !open && <span className="support-fab-dot" />}
        {open ? 'Close' : '💬 Support'}
      </button>
    </div>
  );
}
