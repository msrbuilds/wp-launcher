import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { buildNavGroups } from './nav-items';
import { useFeatures, useBranding, useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  const features = useFeatures() as unknown as Record<string, boolean>;
  const branding = useBranding();
  const { version } = useSettings();
  const { user } = useAuth();
  const groups = buildNavGroups(features, user?.role);

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div
        className={cn(
          'flex h-14 items-center gap-2 border-b border-border px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded" />
          : <div className="h-6 w-6 rounded bg-primary" />}
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-card-foreground">
            {branding.siteTitle}
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                        'hover:bg-accent hover:text-accent-foreground',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );

                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-border px-3 py-3', collapsed && 'px-2 text-center')}>
        {collapsed ? (
          <div className="text-[11px] text-muted-foreground">{version}</div>
        ) : (
          <>
            <div className="truncate text-xs text-card-foreground">{user?.email}</div>
            <div className="text-[11px] text-muted-foreground">{version && `v${version}`}</div>
          </>
        )}
      </div>
    </div>
  );
}
