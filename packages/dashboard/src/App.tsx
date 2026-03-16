import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useIsLocalMode, useBranding, useSettings } from './context/SettingsContext';

export default function App() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const isLocal = useIsLocalMode();
  const branding = useBranding();
  const { version } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Check for updates (admins only, agency mode)
  useEffect(() => {
    if (!isAdmin || isLocal) return;
    fetch('/api/admin/system/update-check', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.updateAvailable) {
          setUpdateAvailable(data.latestVersion || data.latestCommit || 'new');
        }
      })
      .catch(() => {});
  }, [isAdmin, isLocal]);

  return (
    <>
      <header className="header">
        <div className="container">
          <NavLink to="/" className="header-brand">
            <img src={branding.logoUrl || '/logo-square.png'} alt={branding.siteTitle} style={{ width: 28, height: 28, objectFit: 'contain' }} />
            {branding.siteTitle}
            {isLocal && <span className="mode-badge">Local</span>}
            {isAdmin && version && !updateAvailable && <span className="version-badge">v{version}</span>}
            {isAdmin && updateAvailable && (
              <span
                className="version-badge version-badge-update"
                onClick={(e) => { e.preventDefault(); navigate('/admin/system'); }}
                title={`Update available: v${updateAvailable}`}
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" /></svg>
                v{updateAvailable}
              </span>
            )}
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
                    {!isAdmin && (
                      <NavLink to="/account" className={({ isActive }) => isActive ? 'active' : ''}>
                        Account
                      </NavLink>
                    )}
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
