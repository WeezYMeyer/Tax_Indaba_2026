import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const [adminToken, setAdminToken] = useState(sessionStorage.getItem('adminToken') || '');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const [bulkText, setBulkText] = useState('');
  const [tier, setTier] = useState('all');
  const [results, setResults] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [savingAccessId, setSavingAccessId] = useState(null);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

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
    // Accepts lines like: "email@example.com, First Name, Surname"
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email, firstName, ...rest] = line.split(',');
        return {
          email: (email || '').trim(),
          firstName: (firstName || '').trim(),
          lastName: rest.join(',').trim(),
        };
      });
  }

  async function handleBulkSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setResults(null);
    try {
      const attendeesToAdd = parseBulk(bulkText);
      const { results } = await api.addAttendees(attendeesToAdd, tier, adminToken);
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

  async function handleResend(id) {
    setResendingId(id);
    try {
      await api.resendAttendee(id, adminToken);
      loadAttendees(adminToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setResendingId(null);
    }
  }

  async function handleToggleAccess(attendee, dayKey) {
    setSavingAccessId(attendee.id);
    const newAccess = {
      day1: attendee.access.day1,
      day2: attendee.access.day2,
      day3: attendee.access.day3,
      [dayKey]: !attendee.access[dayKey],
    };
    try {
      await api.updateAttendeeAccess(attendee.id, newAccess, adminToken);
      loadAttendees(adminToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAccessId(null);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard?.writeText(text);
  }

  async function loadReport() {
    setLoadingReport(true);
    try {
      const data = await api.attendanceReport(adminToken);
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingReport(false);
    }
  }

  function downloadReportCsv() {
    if (!report) return;
    const header = ['Email', 'Name', 'Day 1 (min)', 'Day 1 Attended', 'Day 2 (min)', 'Day 2 Attended', 'Day 3 (min)', 'Day 3 Attended', 'Total Minutes', 'CPD Points'];
    const rows = report.report.map((r) => [
      r.email,
      r.name || '',
      r.days[0].minutesWatched, r.days[0].attended ? 'Yes' : 'No',
      r.days[1].minutesWatched, r.days[1].attended ? 'Yes' : 'No',
      r.days[2].minutesWatched, r.days[2].attended ? 'Yes' : 'No',
      r.totalMinutes,
      r.cpdPoints,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpd-attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const sentCount = attendees.filter((a) => a.email_status === 'sent').length;
  const failedCount = attendees.filter((a) => a.email_status === 'failed').length;

  return (
    <div className="admin-wrap">
      <div className="eyebrow">Admin</div>
      <h1>Attendee access</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        Paste one attendee per line as <code>email@example.com, First Name, Surname</code> (surname is optional, first name is required — this is what shows in chat, never their email).
        Each new attendee gets an account and an email with their login, with access matching the tier selected below.
      </p>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleBulkSubmit}>
        <div className="field">
          <label>Access tier for this batch</label>
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="all">3-Day Pass — all days</option>
            <option value="day1">Day 1 only — Mon 14 Sept</option>
            <option value="day2">Day 2 only — Tue 15 Sept</option>
            <option value="day3">Day 3 only — Wed 16 Sept</option>
          </select>
        </div>
        <div className="field">
          <label>Attendees (email, first name, surname)</label>
          <textarea
            rows={6}
            placeholder={'jane@example.com, Jane, Doe\njohn@example.com, John, Smith'}
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

      <div className="admin-table-header">
        <div className="admin-summary">
          <span className="summary-pill summary-sent">{sentCount} sent</span>
          {failedCount > 0 && <span className="summary-pill summary-failed">{failedCount} failed</span>}
          <span className="summary-pill">{attendees.length} total</span>
        </div>
        <button className="btn" onClick={() => setShowPasswords((s) => !s)}>
          {showPasswords ? 'Hide passwords' : 'Show passwords'}
        </button>
      </div>

      <table className="attendees">
        <thead>
          <tr>
            <th>Email</th>
            <th>First Name</th>
            <th>Surname</th>
            <th>Password</th>
            <th>Access</th>
            <th>Email Status</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {attendees.map((a) => (
            <tr key={a.id}>
              <td>{a.email}</td>
              <td>{a.firstName || '—'}</td>
              <td>{a.lastName || '—'}</td>
              <td>
                {a.password ? (
                  <span className="password-cell">
                    <code>{showPasswords ? a.password : '••••••••'}</code>
                    {showPasswords && (
                      <button className="icon-btn" title="Copy" onClick={() => copyToClipboard(a.password)}>⧉</button>
                    )}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
              </td>
              <td>
                {a.access && (
                  <div className="access-toggles">
                    {['day1', 'day2', 'day3'].map((dayKey, i) => (
                      <button
                        key={dayKey}
                        className={`access-chip ${a.access[dayKey] ? 'access-on' : 'access-off'}`}
                        disabled={savingAccessId === a.id}
                        onClick={() => handleToggleAccess(a, dayKey)}
                        title={`Day ${i + 1}: click to ${a.access[dayKey] ? 'remove' : 'grant'} access`}
                      >
                        D{i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </td>
              <td>
                <span className={`email-badge email-badge-${a.email_status}`} title={a.email_error || ''}>
                  {a.email_status}
                </span>
              </td>
              <td>{new Date(a.created_at).toLocaleDateString()}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button
                  className="btn"
                  style={{ marginRight: 6 }}
                  disabled={resendingId === a.id}
                  onClick={() => handleResend(a.id)}
                >
                  {resendingId === a.id ? 'Sending…' : 'Resend'}
                </button>
                <button className="btn btn-danger" onClick={() => handleRemove(a.id)}>Revoke</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="report-section">
        <div className="admin-table-header">
          <div>
            <h1 style={{ fontSize: '1.3rem', marginBottom: 4 }}>CPD attendance report</h1>
            <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: '0.85rem' }}>
              Minutes watched per day, derived from live chat/stream session time. Attendance threshold and points-per-hour are configurable via environment variables.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={loadReport} disabled={loadingReport}>
              {loadingReport ? 'Loading…' : report ? 'Refresh' : 'Generate report'}
            </button>
            {report && <button className="btn btn-primary" onClick={downloadReportCsv}>Download CSV</button>}
          </div>
        </div>

        {report && (
          <table className="attendees" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Day 1</th>
                <th>Day 2</th>
                <th>Day 3</th>
                <th>Total</th>
                <th>CPD Points</th>
              </tr>
            </thead>
            <tbody>
              {report.report.map((r) => (
                <tr key={r.email}>
                  <td>{r.email}</td>
                  <td>{r.name || '—'}</td>
                  {r.days.map((d) => (
                    <td key={d.day}>
                      <span className={d.attended ? 'day-cell-attended' : 'day-cell-partial'}>
                        {d.minutesWatched}m ({d.percent}%)
                      </span>
                    </td>
                  ))}
                  <td>{r.totalMinutes}m</td>
                  <td><strong>{r.cpdPoints}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
