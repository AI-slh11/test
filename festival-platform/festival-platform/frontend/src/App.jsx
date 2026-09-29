import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import GreenRoom from './pages/GreenRoom.jsx';
import JudgePortal from './pages/JudgePortal.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import MyResults from './pages/MyResults.jsx';
import PublicSchedule from './pages/PublicSchedule.jsx';
import ProgramsAdmin from './pages/ProgramsAdmin.jsx';
import Hero from './pages/Hero.jsx';
import ControlRoom from './pages/ControlRoom.jsx';
import { ADMIN_PATH } from './adminApi.js';
import AdminDashboard from './pages/AdminDashboard.jsx';
import { api, setAuthToken, clearAuthToken } from './api.js';
import { socket } from './socket.js';
import ClickSparks from './ClickSparks.jsx';
import CommandPalette from './CommandPalette.jsx';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('festival_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const login = (u, token) => {
    setUser(u);
    localStorage.setItem('festival_user', JSON.stringify(u));
    try { sessionStorage.removeItem('festival_login_notice'); } catch {}
    setAuthToken(token);
    socket.disconnect();
    socket.connect();
  };
  const logout = () => {
    api.logout().catch(() => {});
    setUser(null);
    localStorage.removeItem('festival_user');
    clearAuthToken();
    socket.disconnect();
    socket.connect();
  };
  useEffect(() => {
    const handleExpiredSession = () => {
      setUser(null);
      try {
        localStorage.removeItem('festival_user');
        sessionStorage.setItem('festival_login_notice', 'Your session expired. Please sign in again.');
      } catch {}
      clearAuthToken();
      socket.disconnect();
      socket.connect();
    };
    window.addEventListener('festival:session-expired', handleExpiredSession);
    return () => window.removeEventListener('festival:session-expired', handleExpiredSession);
  }, []);
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

function RequireRole({ role, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user || user.role !== role) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <nav className="nav">
      <Link to="/" className="nav-brand"><img src="/brand/logo-mark.png" alt="" /><span>Rendezvous 26</span></Link>
      <div className="nav-links">
        <Link to="/">Home</Link>
        <Link to="/register">Student Registration</Link>
        <Link to="/leaderboard">Leaderboard</Link>
        <Link to="/schedule">Schedule</Link>
        <Link to="/live-results">Live Display</Link>
        <Link to="/my-results">My Results</Link>
        {user?.role === 'organizer' && <Link to="/admin/dashboard">Dashboard</Link>}
        {user?.role === 'organizer' && <Link to="/green-room">Green Room</Link>}
        {user?.role === 'organizer' && <Link to="/admin/programs">Programs</Link>}
        {user?.role === 'judge' && <Link to="/judge">Judge Portal</Link>}
        {user ? (
          <button className="link-btn" onClick={() => { logout(); navigate('/login'); }}>
            Logout ({user.name})
          </button>
        ) : (
          <Link to="/login">Organizer / Judge Login</Link>
        )}
        <span className="cmdk-hint" title="Open command palette"><kbd>⌘</kbd><kbd>K</kbd></span>
      </div>
    </nav>
  );
}

export default function App() {
  // The home page is full-bleed (hero spans the whole screen); other pages keep the centered container.
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const isAdminPage = pathname === ADMIN_PATH; // hidden admin console: no public nav, no links to it anywhere
  return (
    <AuthProvider>
      <ClickSparks />
      <CommandPalette />
      {!isAdminPage && <Nav />}
      <main className={isHome || isAdminPage ? 'main-full' : 'container'}>
        <Routes>
          <Route path="/" element={<Hero />} />
          <Route path={ADMIN_PATH} element={<ControlRoom />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/schedule" element={<PublicSchedule />} />
          <Route path="/live-results" element={<Leaderboard live />} />
          <Route path="/my-results" element={<MyResults />} />
          <Route path="/admin/dashboard" element={<RequireRole role="organizer"><AdminDashboard /></RequireRole>} />
          <Route path="/green-room" element={<RequireRole role="organizer"><GreenRoom /></RequireRole>} />
          <Route path="/check-in" element={<RequireRole role="organizer"><AdminDashboard initialTab="Check-in" /></RequireRole>} />
          <Route path="/admin/programs" element={<RequireRole role="organizer"><ProgramsAdmin /></RequireRole>} />
          <Route path="/judge" element={<RequireRole role="judge"><JudgePortal /></RequireRole>} />
        </Routes>
      </main>
    </AuthProvider>
  );
}
