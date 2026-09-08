import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Event from './pages/Event.jsx';
import Admin from './pages/Admin.jsx';
import TPSummit from './pages/TPSummit.jsx';
import { api } from './api.js';

function useCurrentUser() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return setUser(null);
    api.me().then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);
  return [user, setUser];
}

function Protected({ user, children }) {
  const location = useLocation();
  if (user === undefined) return null; // loading
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function TopBar({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isTpSummit = location.pathname.startsWith('/tp-summit');

  function logout() {
    localStorage.removeItem('token');
    navigate('/login');
  }

  // TP Summit is its own free, separately-branded mini-event — the main
  // Tax Indaba mark doesn't belong on it, so no top bar shows there at all
  // (its own page header carries the "TP Summit" identity instead).
  if (isTpSummit) {
    return null;
  }

  return (
    <div className="topbar">
      <div className="brand">
        <img src="/tax-indaba-logo.png" alt="Tax Indaba" className="brand-logo" />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {user && <button className="btn" onClick={logout}>Log out</button>}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useCurrentUser();

  return (
    <div className="shell">
      <TopBar user={user} />
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/tp-summit" element={<TPSummit />} />
        <Route
          path="/event"
          element={<Protected user={user}><Event user={user} /></Protected>}
        />
        {/* Old links some attendees may have bookmarked/emailed still work */}
        <Route path="/chat" element={<Navigate to="/event" replace />} />
        <Route path="/stream" element={<Navigate to="/event" replace />} />
        <Route path="*" element={<Navigate to={user ? '/event' : '/login'} replace />} />
      </Routes>
    </div>
  );
}
