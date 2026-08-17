import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Event from './pages/Event.jsx';
import Admin from './pages/Admin.jsx';
import { api } from './api.js';

function useCurrentUser() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return setUser(null);
    api.me().then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);
  return user;
}

function Protected({ user, children }) {
  const location = useLocation();
  if (user === undefined) return null; // loading
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function TopBar({ user }) {
  const navigate = useNavigate();
  function logout() {
    localStorage.removeItem('token');
    navigate('/login');
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
  const user = useCurrentUser();

  return (
    <div className="shell">
      <TopBar user={user} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
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
