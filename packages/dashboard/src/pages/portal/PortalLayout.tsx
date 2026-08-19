import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '../../utils/api';
import NotificationBell from '../../components/NotificationBell';

/**
 * The portal frame.
 *
 * Deliberately not AppShell: that is the staff panel's chrome and carries
 * staff navigation, so a client session must never render it.
 */
export default function PortalLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiFetch('/api/portal/auth/me')
      .then(async (res) => {
        if (!res.ok) { navigate('/portal', { replace: true }); return; }
        setEmail((await res.json()).email || '');
      })
      .catch(() => navigate('/portal', { replace: true }))
      .finally(() => setChecking(false));
  }, [navigate]);

  async function signOut() {
    await apiFetch('/api/portal/auth/logout', { method: 'POST' }).catch(() => {});
    navigate('/portal', { replace: true });
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex items-center gap-4">
            <NavLink to="/portal/projects" className={linkClass}>Projects</NavLink>
            <NavLink to="/portal/invoices" className={linkClass}>Invoices</NavLink>
            <NavLink to="/portal/messages" className={linkClass}>Messages</NavLink>
          </nav>
          <div className="flex items-center gap-3">
            <NotificationBell endpoint="/api/portal/notifications" />
            <span className="text-sm text-muted-foreground">{email}</span>
            <Button variant="secondary" size="xs" onClick={signOut}>
              <LogOut className="h-3 w-3" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
