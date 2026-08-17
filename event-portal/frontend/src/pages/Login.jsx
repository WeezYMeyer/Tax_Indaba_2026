import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [searchParams] = useSearchParams();
  const emailFromLink = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailFromLink);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      localStorage.setItem('token', token);
      onLogin(user);
      navigate('/event');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-stage">
      <div className="pass-card">
        <div className="pass-card-badge">
          <img src="/tax-indaba-logo.png" alt="Tax Indaba" className="brand-logo brand-logo-lg" />
        </div>

        <div className="eyebrow" style={{ marginBottom: 4 }}>Attendee Access</div>
        <h1>Welcome back</h1>
        <p className="sub">Log in with the credentials we emailed you to join the chat and stream.</p>

        <div className="pass-perf"><span /><span /></div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={!emailFromLink}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus={Boolean(emailFromLink)}
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={loading}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}

