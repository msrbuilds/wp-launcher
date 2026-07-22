import {
  LayoutDashboard, Globe, Layers,
  Users, FolderKanban, Receipt,
  Activity, BarChart3, Timer,
  RefreshCw, ToggleLeft, Palette, UserCog, Server,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

type Features = Record<string, boolean | undefined>;

const PRIVILEGED = new Set(['owner', 'admin']);

/**
 * Visibility is decided by feature flags and role only — there is no longer a
 * mode. A group with no visible items is omitted rather than rendered empty.
 */
export function buildNavGroups(features: Features, role: string | undefined): NavGroup[] {
  const isPrivileged = !!role && PRIVILEGED.has(role);

  const groups: NavGroup[] = [
    {
      label: 'Panel',
      items: [
        { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
        { to: '/sites', label: 'Sites', icon: Globe },
        { to: '/blueprints', label: 'Blueprints', icon: Layers },
      ],
    },
    {
      label: 'Clients',
      items: features.projects
        ? [
            { to: '/clients', label: 'Clients', icon: Users },
            { to: '/projects', label: 'Projects', icon: FolderKanban },
            { to: '/invoices', label: 'Invoices', icon: Receipt },
          ]
        : [],
    },
    {
      label: 'Insights',
      items: [
        ...(features.healthMonitoring ? [{ to: '/monitoring', label: 'Monitoring', icon: Activity }] : []),
        ...(isPrivileged ? [{ to: '/analytics', label: 'Analytics', icon: BarChart3 }] : []),
        ...(features.productivityMonitor ? [{ to: '/productivity', label: 'Productivity', icon: Timer }] : []),
      ],
    },
    {
      label: 'Sync',
      items: features.siteSync ? [{ to: '/sync', label: 'Sync', icon: RefreshCw }] : [],
    },
    {
      label: 'Settings',
      items: isPrivileged
        ? [
            { to: '/features', label: 'Features', icon: ToggleLeft },
            { to: '/branding', label: 'Branding', icon: Palette },
            { to: '/users', label: 'Team', icon: UserCog },
            { to: '/system', label: 'System', icon: Server },
          ]
        : [],
    },
  ];

  return groups.filter((g) => g.items.length > 0);
}
