import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useIsLocalMode, useBranding, useSettings } from './context/SettingsContext';

export default function App() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const isLocal = useIsLocalMode();
  const branding = useBranding();
  const { version } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header className="header">
        <div className="container">
          <NavLink to="/" className="header-brand">
            <img src={branding.logoUrl || '/logo-square.png'} alt={branding.siteTitle} style={{ width: 28, height: 28, objectFit: 'contain' }} />
            {branding.siteTitle}
            {isLocal && <span className="mode-badge">Local</span>}
            {isAdmin && version && <span className="version-badge">v{version}</span>}
          </NavLink>
          <button className="header-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen
                ? <path d="M6 18L18 6M6 6l12 12" />
                : <path d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
          <nav className={menuOpen ? 'open' : ''}>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
              {isLocal ? 'Dashboard' : 'Products'}
            </NavLink>
            <NavLink to="/sites" className={({ isActive }) => isActive ? 'active' : ''}>
              {isLocal ? 'Sites' : 'My Sites'}
            </NavLink>
            {!isLocal && isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>
                Admin
              </NavLink>
            )}
            {isLocal && (
              <>
                <a href="http://localhost:8025" target="_blank" rel="noopener noreferrer">
                  Mail
                </a>
                <NavLink to="/create-template" className="btn btn-sm header-btn-outline">
                  + New Template
                </NavLink>
                <Link to="/create" className="btn btn-primary btn-sm header-btn-primary">
                  + Create Site
                </Link>
              </>
            )}
            {!isLocal && isAdmin && (
              <NavLink to="/create-product" className="btn btn-sm header-btn-outline">
                + New Product
              </NavLink>
            )}
            {!isLocal && (
              <>
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
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="page-wrapper">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <footer className="footer">
        Built with <a href="https://github.com/msrbuilds/wp-launcher" target="_blank" rel="noopener noreferrer">WP Launcher</a> by <a href="https://msrbuilds.com" target="_blank" rel="noopener noreferrer">MSR Builds</a>
      </footer>
    </>
  );
}
