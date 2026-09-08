import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';

const TP_TOKEN_KEY = 'tpSummitToken';
const TP_NAME_KEY = 'tpSummitName';

export default function TPSummit() {
  const [token, setToken] = useState(localStorage.getItem(TP_TOKEN_KEY) || '');
  const [name, setName] = useState(localStorage.getItem(TP_NAME_KEY) || '');

  const [captureName, setCaptureName] = useState('');
  const [captureEmail, setCaptureEmail] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [capturing, setCapturing] = useState(false);

  const [embedUrl, setEmbedUrl] = useState(null);
  const [streamError, setStreamError] = useState('');

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const socketRef = useRef(null);
  const scrollRef = useRef(null);

  async function handleCapture(e) {
    e.preventDefault();
    setCaptureError('');
    setCapturing(true);
    try {
      const { token: newToken } = await api.tpSummitCapture(captureEmail, captureName);
      localStorage.setItem(TP_TOKEN_KEY, newToken);
      localStorage.setItem(TP_NAME_KEY, captureName);
      setToken(newToken);
      setName(captureName);
    } catch (err) {
      setCaptureError(err.message);
    } finally {
      setCapturing(false);
    }
  }

  useEffect(() => {
    if (!token) return;

    api.tpSummitAccess(token)
      .then((data) => setEmbedUrl(data.embedUrl))
      .catch((err) => setStreamError(err.message));

    const socket = io('/', { auth: { token, room: 'tp-summit' } });
    socketRef.current = socket;

    socket.on('history', (history) => setMessages(history));
    socket.on('chat:message', (msg) => setMessages((prev) => [...prev, msg]));
    socket.on('access-denied', () => setStreamError('Session expired — please refresh and re-enter your details.'));

    return () => socket.disconnect();
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    socketRef.current.emit('chat:message', text);
    setDraft('');
  }

  if (!token) {
    return (
      <div className="hero-bg-wrap tp-bg-wrap tp-theme">
        <div className="center-stage">
          <div className="pass-card">
            <div className="eyebrow" style={{ marginBottom: 4 }}>Free To Attend</div>
            <h1>TP Summit</h1>
            <p className="sub">Transfer Pricing Summit — live 15 September 2026. Enter your details to watch.</p>

            <div className="pass-perf"><span /><span /></div>

            {captureError && <div className="error-msg">{captureError}</div>}

            <form onSubmit={handleCapture}>
              <div className="field">
                <label>Name</label>
                <input type="text" value={captureName} onChange={(e) => setCaptureName(e.target.value)} required autoFocus />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={captureEmail} onChange={(e) => setCaptureEmail(e.target.value)} required />
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={capturing}>
                {capturing ? 'One moment…' : 'Watch Now'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-bg-wrap tp-bg-wrap tp-theme">
      <div className="event-page">
        <div className="tp-summit-header">
          <div className="eyebrow">You're watching</div>
          <h1 className="tp-summit-title">TP Summit</h1>
          <div className="event-meta" style={{ justifyContent: 'center' }}>
            <span>15 September 2026</span>
          </div>
        </div>

        <div className="event-layout">
          <div className="stream-col">
            <div className="stream-frame">
              {embedUrl ? (
                <iframe src={embedUrl} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title="TP Summit stream" />
              ) : streamError ? (
                <div className="holding-slide">
                  <p className="holding-slide-day">TP Summit</p>
                  <p className="holding-slide-sub">Live 15 September 2026 — check back then to watch.</p>
                </div>
              ) : (
                <div className="stream-placeholder">Loading stream…</div>
              )}
            </div>
          </div>

          <div className="chat-col">
            <div className="chat-scroll" ref={scrollRef}>
              {messages.map((m, i) => (
                <div className="msg" key={i}>
                  <div className="who">{m.username}</div>
                  <div className="body">{m.content}</div>
                </div>
              ))}
              {messages.length === 0 && (
                <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 30 }}>
                  No messages yet — say hello.
                </p>
              )}
            </div>
            <form className="chat-input-row" onSubmit={send}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message as ${name || 'you'}…`}
              />
              <button className="btn btn-primary">Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
