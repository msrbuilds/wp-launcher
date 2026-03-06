import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useAdminAuth } from './pages/AdminPage';

export default function App() {
  const { isAuthenticated, logout } = useAuth();
  const { isAdmin } = useAdminAuth();

  return (
    <>
      <header className="header">
        <div className="container">
          <NavLink to="/" className="header-brand">
            <svg viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="url(#grad)" />
              <path d="M8 14l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#3b82f6"/>
                  <stop offset="1" stopColor="#6366f1"/>
                </linearGradient>
              </defs>
            </svg>
            WP Launcher
          </NavLink>
          <nav>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
              Products
            </NavLink>
            <NavLink to="/sites" className={({ isActive }) => isActive ? 'active' : ''}>
              My Sites
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>
                Admin
              </NavLink>
            )}
            <span className="nav-divider" />
            {isAuthenticated ? (
              <>
                <NavLink to="/account" className={({ isActive }) => isActive ? 'active' : ''}>
                  Account
                </NavLink>
                <span className="nav-action" onClick={logout}>
                  Log out
                </span>
              </>
            ) : (
              <NavLink to="/login" className={({ isActive }) => isActive ? 'active' : ''}>
                Log In
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="page-wrapper">
        <div className="container">
          <Outlet />
        </div>
      </main>
    </>
  );
}
