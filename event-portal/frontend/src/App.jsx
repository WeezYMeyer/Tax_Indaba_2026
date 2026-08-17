import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Chat from './pages/Chat.jsx';
import Stream from './pages/Stream.jsx';
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
      <div className="brand"><span className="dot" /> Event Portal</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {user && (
          <>
            <Link className="btn" to="/chat">Chat</Link>
            <Link className="btn" to="/stream">Stream</Link>
            <button className="btn" onClick={logout}>Log out</button>
          </>
        )}
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
          path="/chat"
          element={<Protected user={user}><Chat user={user} /></Protected>}
        />
        <Route
          path="/stream"
          element={<Protected user={user}><Stream /></Protected>}
        />
        <Route path="*" element={<Navigate to={user ? '/chat' : '/login'} replace />} />
      </Routes>
    </div>
  );
}
