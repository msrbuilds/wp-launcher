import { useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, Sun, Moon, Monitor, LogOut, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFeatures } from '../../context/SettingsContext';
import { buildNavGroups } from './nav-items';

function useBreadcrumb(): string {
  const { pathname } = useLocation();
  const features = useFeatures() as unknown as Record<string, boolean>;
  const { user } = useAuth();

  for (const group of buildNavGroups(features, user?.role)) {
    for (const item of group.items) {
      const matches = item.end
        ? pathname === item.to
        : pathname.startsWith(item.to) && item.to !== '/';
      if (matches) return item.label;
    }
  }
  // Routes without a nav entry still need a title.
  if (pathname === '/') return 'Overview';
  if (pathname === '/sites/new') return 'New Site';
  return '';
}

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { choice, cycleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const crumb = useBreadcrumb();

  const ThemeIcon = choice === 'light' ? Sun : choice === 'dark' ? Moon : Monitor;

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-4">
      <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <PanelLeft className="h-4 w-4" />
      </Button>
      <div className="text-sm font-medium text-foreground">{crumb}</div>

      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" className="mr-1" onClick={() => navigate('/sites/new')}>
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">New Site</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label={`Theme: ${choice}`}
          title={`Theme: ${choice}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="max-w-[12rem] truncate">
              {user?.email ?? 'Account'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
