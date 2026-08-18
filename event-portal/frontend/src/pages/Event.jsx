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
  const [chatBlocked, setChatBlocked] = useState(false);
  const socketRef = useRef(null);
  const scrollRef = useRef(null);

  // Load which days are configured + which the attendee has ticket access to
  useEffect(() => {
    api.streamDays()
      .then((data) => {
        setDays(data.days);
        // Default to the first day that's both live and within this
        // attendee's ticket, so nobody lands on a locked tab by default.
        const firstUsable = data.days.find((d) => d.configured && d.hasAccess) || data.days.find((d) => d.hasAccess);
        if (firstUsable) setActiveDay(firstUsable.day);
      })
      .catch(() => setDays([{ day: 1, label: 'Day 1', configured: true, hasAccess: true }]));
  }, []);

  // Load the stream embed + (re)connect chat whenever the active day changes
  useEffect(() => {
    setEmbedUrl(null);
    setStreamError('');
    setMessages([]);
    setChatBlocked(false);

    api.streamAccess(activeDay)
      .then((data) => setEmbedUrl(data.embedUrl))
      .catch((err) => setStreamError(err.message));

    const token = localStorage.getItem('token');
    const socket = io('/', { auth: { token, day: activeDay } });
    socketRef.current = socket;

    socket.on('history', (history) => setMessages(history));
    socket.on('chat:message', (msg) => setMessages((prev) => [...prev, msg]));
    socket.on('access-denied', () => setChatBlocked(true));

    return () => socket.disconnect();
  }, [activeDay]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || chatBlocked) return;
    socketRef.current.emit('chat:message', text);
    setDraft('');
  }

  const displayDays = days.length ? days : [{ day: 1, label: 'Day 1', configured: true, hasAccess: true }];
  const activeDayInfo = displayDays.find((d) => d.day === activeDay);

  return (
    <div className="event-page">
      <div className="hero-banner">
        <img src="/tax-indaba-logo.png" alt="Tax Indaba" className="hero-logo" />
        <p className="hero-tagline">'From Constraint to Capacity: Turning Fiscal Space into Sustainable Reform'</p>
        <div className="event-meta hero-meta">
          <span>14–16 Sept 2026</span>
          <span className="event-meta-dot" />
          <span>The Capital On The Park, Sandton</span>
        </div>
      </div>

      <div className="day-tabs">
        {displayDays.map((d) => (
          <button
            key={d.day}
            className={`day-tab ${activeDay === d.day ? 'active' : ''} ${!d.hasAccess ? 'day-tab-locked' : ''}`}
            onClick={() => d.hasAccess && setActiveDay(d.day)}
            disabled={!d.hasAccess}
            title={!d.hasAccess ? "Your ticket doesn't include this day" : undefined}
          >
            {d.label}
            {!d.hasAccess && <span className="day-tab-soon">🔒</span>}
            {d.hasAccess && !d.configured && <span className="day-tab-soon">soon</span>}
          </button>
        ))}
      </div>

      <div className="event-layout">
        <div className="stream-col">
          <div className="stream-frame">
            {!activeDayInfo?.hasAccess ? (
              <div className="stream-placeholder">
                Your ticket doesn't include Day {activeDay}. Contact the organizers to upgrade your pass.
              </div>
            ) : embedUrl ? (
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
            {chatBlocked ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 30 }}>
                Chat for this day isn't included in your ticket.
              </p>
            ) : (
              <>
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
              </>
            )}
          </div>
          <form className="chat-input-row" onSubmit={send}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message as ${user?.name || 'you'}…`}
              disabled={chatBlocked}
            />
            <button className="btn btn-primary" disabled={chatBlocked}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
