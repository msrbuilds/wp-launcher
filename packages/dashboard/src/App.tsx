import { Outlet, NavLink, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useAdminAuth } from './pages/AdminPage';
import { useIsLocalMode } from './context/SettingsContext';

export default function App() {
  const { isAuthenticated, logout } = useAuth();
  const { isAdmin } = useAdminAuth();
  const isLocal = useIsLocalMode();

  return (
    <>
      <header className="header">
        <div className="container">
          <NavLink to="/" className="header-brand">
            <img src="/logo-square.png" alt="WP Launcher" style={{ width: 28, height: 28 }} />
            WP Launcher
            {isLocal && <span className="mode-badge">Local</span>}
          </NavLink>
          <nav>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
              {isLocal ? 'Templates' : 'Products'}
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
                <Link to="/create" className="btn btn-primary btn-sm" style={{ marginLeft: '0.75rem', color: '#fff' }}>
                  + Create Site
                </Link>
              </>
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
