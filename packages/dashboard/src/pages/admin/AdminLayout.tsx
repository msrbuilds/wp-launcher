import { useState, useEffect, createContext, useContext } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useIsLocalMode, useBranding, useSettings, useFeatures } from '../../context/SettingsContext';

interface AdminFetchOpts {
  headers: Record<string, string>;
  credentials: RequestCredentials;
}
const AdminHeadersContext = createContext<AdminFetchOpts>({ headers: {}, credentials: 'include' });
export function useAdminHeaders(): Record<string, string> {
  return useContext(AdminHeadersContext).headers;
}
export function useAdminFetch(): AdminFetchOpts {
  return useContext(AdminHeadersContext);
}

export function useAdminAuth() {
  const { isAdmin } = useAuth();
  return { isAdmin };
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  external?: boolean;
  separator?: boolean;
}

function getNavItems(isLocal: boolean, features?: Record<string, boolean>): NavItem[] {
  const projectItems: NavItem[] = features?.projects ? [
    { to: isLocal ? '/clients' : '/admin/clients', label: 'Clients', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', separator: true },
    { to: isLocal ? '/projects' : '/admin/projects', label: 'Projects', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { to: isLocal ? '/invoices' : '/admin/invoices', label: 'Invoices', icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  ] : [];

  if (isLocal) {
    return [
      { to: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', end: true },
      { to: '/sites', label: 'Sites', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
      { to: '/products', label: 'Templates', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      { to: '/bulk', label: 'Bulk Launch', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', separator: true },
      { to: '/logs', label: 'Logs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
      { to: '/sync', label: 'Sync', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
      ...projectItems,
      { to: '/features', label: 'Features', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', separator: true },
      { to: '/branding', label: 'Branding', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
      { to: '/system', label: 'System', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' },
    ];
  }
  return [
    { to: '/admin', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', end: true },
    { to: '/admin/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { to: '/admin/bulk', label: 'Bulk Launch', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { to: '/admin/products', label: 'Products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { to: '/admin/users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { to: '/admin/sites', label: 'Sites', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
    { to: '/admin/logs', label: 'Logs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    ...projectItems,
    { to: '/admin/features', label: 'Features', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { to: '/admin/branding', label: 'Branding', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
    { to: '/admin/system', label: 'System', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' },
  ];
}

export default function AdminLayout() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const isLocal = useIsLocalMode();
  const branding = useBranding();
  const { version } = useSettings();
  const features = useFeatures();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const NAV_ITEMS = getNavItems(isLocal, features as unknown as Record<string, boolean>);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/');
  }

  // Auth guards (agency mode only — local mode auto-authenticates)
  if (!isLocal) {
    if (!isAuthenticated) {
      return (
        <div className="card auth-card al-auth-padding">
          <div className="al-auth-center">
            <h2 className="al-auth-title">Admin Access</h2>
            <p className="al-auth-subtitle">Log in with an admin account to access this panel.</p>
          </div>
          <button className="btn btn-primary btn-lg al-btn-full" onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      );
    }

    if (!isAdmin) {
      return (
        <div className="card auth-card al-auth-padding">
          <div className="al-auth-center">
            <h2 className="al-auth-title-denied">Access Denied</h2>
            <p className="al-auth-subtitle">Your account does not have admin privileges. Contact an administrator to get access.</p>
          </div>
          <button className="btn btn-secondary btn-lg al-btn-full" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      );
    }
  }

  const headers: Record<string, string> = {};

  const currentLabel = NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to) && item.to !== '/' && item.to !== '/admin'
  )?.label || (isLocal ? 'Dashboard' : 'Overview');

  return (
    <AdminHeadersContext.Provider value={{ headers, credentials: 'include' }}>
      <div className={`admin-layout${isLocal ? ' admin-layout-local' : ''}`}>
        {/* Mobile top bar */}
        <div className="admin-mobile-bar">
          <button className="admin-hamburger" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Toggle navigation">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileNavOpen
                ? <path d="M6 18L18 6M6 6l12 12" />
                : <path d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
          <span className="admin-mobile-title">{currentLabel}</span>
          {!isLocal && <button className="btn btn-sm btn-danger" onClick={handleLogout}>Logout</button>}
        </div>

        {/* Overlay backdrop */}
        {mobileNavOpen && <div className="admin-overlay" onClick={() => setMobileNavOpen(false)} />}

        {/* Sidebar */}
        <aside className={`admin-sidebar ${mobileNavOpen ? 'open' : ''}`}>
          <div className="admin-sidebar-header">
            {isLocal ? (
              <>
                <div className="al-sidebar-brand">
                  <img src={branding.logoUrl || '/logo-square.png'} alt="" className="al-sidebar-logo" />
                  <h3 className="al-sidebar-heading">WP Launcher</h3>
                </div>
                {version && (
                  <span className="al-version">v{version}</span>
                )}
              </>
            ) : (
              <h3 className="al-sidebar-heading">Admin Panel</h3>
            )}
          </div>
          <nav className="admin-nav">
            {NAV_ITEMS.map((item) => (
              <div key={item.to}>
                {item.separator && <div className="admin-nav-separator" />}
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
                >
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                  <span>{item.label}</span>
                </NavLink>
              </div>
            ))}
            {isLocal && (
              <>
                <div className="admin-nav-separator" />
                <a
                  href="http://localhost:8025"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-nav-item"
                >
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Mailbox</span>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="al-external-icon">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              </>
            )}
          </nav>
          {!isLocal && (
            <div className="admin-sidebar-footer">
              <button className="btn btn-sm btn-danger al-btn-full" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </aside>

        <main className="admin-content">
          <Outlet />
          {isLocal && (
            <footer className="footer" style={{ marginTop: 'auto' }}>
              Built with <a href="https://github.com/msrbuilds/wp-launcher" target="_blank" rel="noopener noreferrer">WP Launcher</a> by <a href="https://msrbuilds.com" target="_blank" rel="noopener noreferrer">MSR Builds</a>
            </footer>
          )}
        </main>
      </div>
    </AdminHeadersContext.Provider>
  );
}
