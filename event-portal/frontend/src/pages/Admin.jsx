import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const [adminToken, setAdminToken] = useState(sessionStorage.getItem('adminToken') || '');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const [namesText, setNamesText] = useState('');
  const [emailsText, setEmailsText] = useState('');
  const [tier, setTier] = useState('all');
  const [sendEmail, setSendEmail] = useState(false);
  const [results, setResults] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [savingAccessId, setSavingAccessId] = useState(null);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [tpLeads, setTpLeads] = useState(null);
  const [loadingTpLeads, setLoadingTpLeads] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

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

  // Splits "Jane Doe" -> firstName "Jane", lastName "Doe" (everything after
  // the first word). Handles multi-word surnames like "Jane Van Der Merwe".
  function parseNames(text) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' '),
        };
      });
  }

  function parseEmails(text) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const parsedNames = parseNames(namesText);
  const parsedEmails = parseEmails(emailsText);
  const countsMismatch = namesText.trim() !== '' && emailsText.trim() !== '' && parsedNames.length !== parsedEmails.length;

  async function handleBulkSubmit(e) {
    e.preventDefault();
    setError('');
    if (parsedNames.length === 0 || parsedEmails.length === 0) {
      setError('Paste at least one name and one email.');
      return;
    }
    if (countsMismatch) {
      setError(`Names list has ${parsedNames.length} line(s) but Emails list has ${parsedEmails.length} — they're matched up line-by-line, so the counts need to match. Check for a blank line or an extra row.`);
      return;
    }
    setSubmitting(true);
    setResults(null);
    try {
      const attendeesToAdd = parsedNames.map((n, i) => ({
        email: parsedEmails[i],
        firstName: n.firstName,
        lastName: n.lastName,
      }));
      const { results } = await api.addAttendees(attendeesToAdd, tier, sendEmail, adminToken);
      setResults(results);
      setNamesText('');
      setEmailsText('');
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

  async function handleClearTestData() {
    if (!confirm('This permanently deletes all chat messages and watch-time session data (not attendee accounts). Use this once, right before sending real invite links, to clear out testing. Continue?')) return;
    setClearingChat(true);
    try {
      await api.clearTestData(adminToken);
      alert('Chat messages and session data cleared.');
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingChat(false);
    }
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

  async function loadTpLeads() {
    setLoadingTpLeads(true);
    try {
      const data = await api.tpSummitLeads(adminToken);
      setTpLeads(data.leads);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingTpLeads(false);
    }
  }

  function downloadTpLeadsCsv() {
    if (!tpLeads) return;
    const header = ['Email', 'Name', 'Captured At', 'Minutes Watched'];
    const rows = tpLeads.map((l) => [
      l.email,
      l.name || '',
      new Date(l.captured_at).toLocaleString(),
      l.minutesWatched,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tp-summit-leads-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const filteredAttendees = attendees.filter((a) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      a.email.toLowerCase().includes(q) ||
      (a.firstName || '').toLowerCase().includes(q) ||
      (a.lastName || '').toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredAttendees.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedAttendees = filteredAttendees.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearchChange(value) {
    setSearchQuery(value);
    setCurrentPage(1);
  }

  return (
    <div className="admin-wrap">
      <div className="eyebrow">Admin</div>
      <h1>Attendee access</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        Copy the Name column from wherever you're given the list and paste it in the left box, one name per line —
        then copy the Email column and paste it in the right box, same order. Line 1 of each pairs together, line 2
        pairs together, and so on. Surname is optional (first word of each line is treated as the first name, the
        rest as surname — this is what shows in chat, never their email).
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
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label>Names (one per line — "First Last")</label>
            <textarea
              rows={10}
              placeholder={'Jane Doe\nJohn Smith'}
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              required
            />
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
              {parsedNames.length} name{parsedNames.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label>Emails (one per line, same order)</label>
            <textarea
              rows={10}
              placeholder={'jane@example.com\njohn@example.com'}
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
              required
            />
            <div style={{ fontSize: '0.78rem', color: countsMismatch ? 'var(--danger)' : 'var(--text-dim)', marginTop: 4 }}>
              {parsedEmails.length} email{parsedEmails.length === 1 ? '' : 's'}
              {countsMismatch && ' — doesn\'t match the names list yet'}
            </div>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0', fontSize: '0.9rem', color: 'var(--text-dim)' }}>
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} style={{ width: 'auto' }} />
          Send login emails automatically (leave unchecked if you're handing out passwords yourself)
        </label>
        <button className="btn btn-primary" disabled={submitting || countsMismatch}>
          {submitting ? 'Adding…' : sendEmail ? 'Add attendees & send logins' : 'Add attendees'}
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setShowPasswords((s) => !s)}>
            {showPasswords ? 'Hide passwords' : 'Show passwords'}
          </button>
          <button className="btn btn-danger" onClick={handleClearTestData} disabled={clearingChat}>
            {clearingChat ? 'Clearing…' : 'Clear test chat data'}
          </button>
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <input
          type="text"
          placeholder="Search by email or name…"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
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
          {pagedAttendees.map((a) => (
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
          {pagedAttendees.length === 0 && (
            <tr><td colSpan={8} style={{ color: 'var(--text-dim)' }}>No attendees match that search.</td></tr>
          )}
        </tbody>
      </table>

      {filteredAttendees.length > 0 && (
        <div className="pagination-row">
          <span className="pagination-summary">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredAttendees.length)} of {filteredAttendees.length}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>Previous</button>
            <span className="pagination-summary">Page {safePage} of {totalPages}</span>
            <button className="btn" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

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

      <div className="report-section">
        <div className="admin-table-header">
          <div>
            <h1 style={{ fontSize: '1.3rem', marginBottom: 4 }}>TP Summit — who watched</h1>
            <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: '0.85rem' }}>
              Everyone who entered their details for TP Summit, whether via the public link or the "TP Summit" tab on /event, plus their watch time.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={loadTpLeads} disabled={loadingTpLeads}>
              {loadingTpLeads ? 'Loading…' : tpLeads ? 'Refresh' : 'Load list'}
            </button>
            {tpLeads && <button className="btn btn-primary" onClick={downloadTpLeadsCsv}>Download CSV</button>}
          </div>
        </div>

        {tpLeads && (
          <table className="attendees" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Captured</th>
                <th>Minutes Watched</th>
              </tr>
            </thead>
            <tbody>
              {tpLeads.map((l) => (
                <tr key={l.email}>
                  <td>{l.email}</td>
                  <td>{l.name || '—'}</td>
                  <td>{new Date(l.captured_at).toLocaleString()}</td>
                  <td>{l.minutesWatched}m</td>
                </tr>
              ))}
              {tpLeads.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--text-dim)' }}>No one has registered for TP Summit yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
