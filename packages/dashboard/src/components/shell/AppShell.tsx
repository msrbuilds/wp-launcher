import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';

const COLLAPSE_KEY = 'wpl-sidebar-collapsed';

export default function AppShell() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
          <h2 className="mb-1 text-lg font-semibold text-card-foreground">Sign in required</h2>
          <p className="mb-4 text-sm text-muted-foreground">Log in to access this panel.</p>
          <Button className="w-full" onClick={() => navigate('/login')}>Go to login</Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside
          className={cn(
            'hidden shrink-0 transition-[width] duration-200 md:block',
            collapsed ? 'w-16' : 'w-60',
          )}
        >
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-30 transition-[width] duration-200',
              collapsed ? 'w-16' : 'w-60',
            )}
          >
            <Sidebar collapsed={collapsed} />
          </div>
        </aside>

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-60 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onToggleSidebar={() => {
              if (window.matchMedia('(min-width: 768px)').matches) setCollapsed((c) => !c);
              else setDrawerOpen(true);
            }}
          />
          <main className="flex-1 p-4 md:p-6">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
