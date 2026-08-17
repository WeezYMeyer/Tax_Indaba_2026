import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';

export default function Event({ user }) {
  const [days, setDays] = useState([]);
  const [activeDay, setActiveDay] = useState(1);
  const [embedUrl, setEmbedUrl] = useState(null);
  const [streamError, setStreamError] = useState('');

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const socketRef = useRef(null);
  const scrollRef = useRef(null);

  // Load which days are configured, once
  useEffect(() => {
    api.streamDays()
      .then((data) => {
        setDays(data.days);
        const firstConfigured = data.days.find((d) => d.configured);
        if (firstConfigured) setActiveDay(firstConfigured.day);
      })
      .catch(() => setDays([{ day: 1, label: 'Day 1', configured: true }]));
  }, []);

  // Load the stream embed + (re)connect chat whenever the active day changes
  useEffect(() => {
    setEmbedUrl(null);
    setStreamError('');
    setMessages([]);

    api.streamAccess(activeDay)
      .then((data) => setEmbedUrl(data.embedUrl))
      .catch((err) => setStreamError(err.message));

    const token = localStorage.getItem('token');
    const socket = io('/', { auth: { token, day: activeDay } });
    socketRef.current = socket;

    socket.on('history', (history) => setMessages(history));
    socket.on('chat:message', (msg) => setMessages((prev) => [...prev, msg]));

    return () => socket.disconnect();
  }, [activeDay]);

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

  return (
    <div className="event-page">
      <div className="event-header">
        <div>
          <div className="eyebrow">13th Annual Tax Indaba</div>
          <h1 className="event-title">'From Constraint to Capacity: Turning Fiscal Space into Sustainable Reform'</h1>
        </div>
        <div className="event-meta">
          <span>14–16 Sept 2026</span>
          <span className="event-meta-dot" />
          <span>The Capital On The Park, Sandton</span>
        </div>
      </div>

      <div className="day-tabs">
        {(days.length ? days : [{ day: 1, label: 'Day 1', configured: true }]).map((d) => (
          <button
            key={d.day}
            className={`day-tab ${activeDay === d.day ? 'active' : ''}`}
            onClick={() => setActiveDay(d.day)}
          >
            {d.label}
            {!d.configured && <span className="day-tab-soon">soon</span>}
          </button>
        ))}
      </div>

      <div className="event-layout">
        <div className="stream-col">
          <div className="stream-frame">
            {embedUrl ? (
              <iframe src={embedUrl} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title="Event stream" />
            ) : streamError ? (
              <div className="stream-placeholder">{streamError}</div>
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
              placeholder={`Message as ${user?.name || user?.email || ''}…`}
            />
            <button className="btn btn-primary">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
