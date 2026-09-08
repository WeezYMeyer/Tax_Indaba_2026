import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';
import SponsorBar from '../SponsorBar.jsx';

const TP_TAB = { day: 'tp-summit', label: 'TP Summit', configured: true, hasAccess: true, isTpSummit: true };

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

  // Load the stream embed + (re)connect chat whenever the active tab changes.
  // TP Summit is free and uses its own dedicated chat room + access check,
  // separate from the ticketed Day 1/2/3 rooms.
  useEffect(() => {
    setEmbedUrl(null);
    setStreamError('');
    setMessages([]);
    setChatBlocked(false);

    const token = localStorage.getItem('token');
    const isTp = activeDay === 'tp-summit';

    const accessCall = isTp ? api.tpSummitAccess(token) : api.streamAccess(activeDay);
    accessCall
      .then((data) => setEmbedUrl(data.embedUrl))
      .catch((err) => setStreamError(err.message));

    const socket = io('/', isTp ? { auth: { token, room: 'tp-summit' } } : { auth: { token, day: activeDay } });
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

  const displayDays = [...(days.length ? days : [{ day: 1, label: 'Day 1', configured: true, hasAccess: true }]), TP_TAB];
  const activeDayInfo = displayDays.find((d) => d.day === activeDay);
  const isTpTab = activeDayInfo?.isTpSummit;

  return (
    <div className={`hero-bg-wrap ${isTpTab ? 'tp-bg-wrap tp-theme' : ''}`}>
      <div className="event-page">
        <div className="day-tabs">
          {displayDays.map((d) => (
            <button
              key={d.day}
              className={`day-tab ${activeDay === d.day ? 'active' : ''} ${!d.hasAccess ? 'day-tab-locked' : ''} ${d.isTpSummit ? 'day-tab-tp' : ''}`}
              onClick={() => d.hasAccess && setActiveDay(d.day)}
              disabled={!d.hasAccess}
              title={!d.hasAccess ? "Your ticket doesn't include this day" : undefined}
            >
              {d.label}
              {!d.hasAccess && <span className="day-tab-soon">🔒</span>}
              {d.hasAccess && !d.configured && <span className="day-tab-soon">soon</span>}
              {d.isTpSummit && <span className="day-tab-soon">free</span>}
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
                <div className="holding-slide">
                  {!isTpTab && <img src="/tax-indaba-logo.png" alt="Tax Indaba" className="holding-slide-logo" />}
                  <p className="holding-slide-day">{activeDayInfo?.label || `Day ${activeDay}`}</p>
                  <p className="holding-slide-sub">
                    {isTpTab
                      ? 'Live 15 September 2026 — check back then to watch.'
                      : 'Stream starting soon — check back closer to the event.'}
                  </p>
                </div>
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

      <SponsorBar />
    </div>
  );
}
