import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export default function Chat({ user }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const socketRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = io('/', { auth: { token } });
    socketRef.current = socket;

    socket.on('history', (history) => setMessages(history));
    socket.on('chat:message', (msg) => setMessages((prev) => [...prev, msg]));

    return () => socket.disconnect();
  }, []);

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
    <div className="chat-layout">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m, i) => (
          <div className="msg" key={i}>
            <div className="who">{m.username}</div>
            <div className="body">{m.content}</div>
          </div>
        ))}
        {messages.length === 0 && (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 40 }}>
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
  );
}
