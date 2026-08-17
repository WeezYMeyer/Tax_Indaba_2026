import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const [adminToken, setAdminToken] = useState(sessionStorage.getItem('adminToken') || '');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const [bulkText, setBulkText] = useState('');
  const [results, setResults] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdminLogin(e) {
    e.preventDefault();
    setError('');
    try {
      const { token } = await api.adminLogin(pw);
      sessionStorage.setItem('adminToken', token);
      setAdminToken(token);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadAttendees(token) {
    try {
      const { attendees } = await api.listAttendees(token);
      setAttendees(attendees);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (adminToken) loadAttendees(adminToken);
  }, [adminToken]);

  function parseBulk(text) {
    // Accepts lines like: "email@example.com, Full Name" or just "email@example.com"
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email, ...rest] = line.split(',');
        return { email: email.trim(), name: rest.join(',').trim() };
      });
  }

  async function handleBulkSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setResults(null);
    try {
      const attendeesToAdd = parseBulk(bulkText);
      const { results } = await api.addAttendees(attendeesToAdd, adminToken);
      setResults(results);
      setBulkText('');
      loadAttendees(adminToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id) {
    if (!confirm('Revoke this attendee\'s access?')) return;
    await api.removeAttendee(id, adminToken);
    loadAttendees(adminToken);
  }

  if (!adminToken) {
    return (
      <div className="center-stage">
        <div className="pass-card">
          <div className="eyebrow">Admin</div>
          <h1>Organizer login</h1>
          <p className="sub">Enter your admin password to manage attendees.</p>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleAdminLogin}>
            <div className="field">
              <label>Admin password</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}>Enter</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <div className="eyebrow">Admin</div>
      <h1>Attendee access</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        Paste one attendee per line as <code>email@example.com, Full Name</code> (name is optional).
        Each new attendee gets an account and an email with their login.
      </p>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleBulkSubmit}>
        <div className="field">
          <textarea
            rows={6}
            placeholder={'jane@example.com, Jane Doe\njohn@example.com'}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add attendees & send logins'}
        </button>
      </form>

      {results && (
        <div className="results-list">
          {results.map((r, i) => (
            <div key={i} className={`status-${r.status}`}>
              {r.email} — {r.status}{r.reason ? ` (${r.reason})` : ''}
            </div>
          ))}
        </div>
      )}

      <table className="attendees">
        <thead>
          <tr><th>Email</th><th>Name</th><th>Joined</th><th></th></tr>
        </thead>
        <tbody>
          {attendees.map((a) => (
            <tr key={a.id}>
              <td>{a.email}</td>
              <td>{a.name || '—'}</td>
              <td>{new Date(a.created_at).toLocaleDateString()}</td>
              <td><button className="btn btn-danger" onClick={() => handleRemove(a.id)}>Revoke</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
