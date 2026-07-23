import {
  LayoutDashboard, Globe, Layers,
  Users, FolderKanban, Receipt,
  Activity, BarChart3, Timer,
  RefreshCw, ToggleLeft, Palette, UserCog, Server, SlidersHorizontal,
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
      // Members manage only their own sites; the admin Overview and Blueprint
      // management are hidden from them.
      items: [
        ...(isPrivileged ? [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }] : []),
        { to: '/sites', label: 'Sites', icon: Globe },
        ...(isPrivileged ? [{ to: '/blueprints', label: 'Blueprints', icon: Layers }] : []),
      ],
    },
    // Everything below is an admin/owner-only area, so each item requires
    // privilege *and* its feature flag — a member would only be redirected back
    // to their sites, so the tab must not appear for them at all.
    {
      label: 'Clients',
      items: isPrivileged && features.projects
        ? [
            { to: '/clients', label: 'Clients', icon: Users },
            { to: '/projects', label: 'Projects', icon: FolderKanban },
            { to: '/invoices', label: 'Invoices', icon: Receipt },
          ]
        : [],
    },
    {
      label: 'Insights',
      items: isPrivileged
        ? [
            ...(features.healthMonitoring ? [{ to: '/monitoring', label: 'Monitoring', icon: Activity }] : []),
            { to: '/analytics', label: 'Analytics', icon: BarChart3 },
            ...(features.productivityMonitor ? [{ to: '/productivity', label: 'Productivity', icon: Timer }] : []),
          ]
        : [],
    },
    {
      label: 'Sync',
      items: isPrivileged && features.siteSync ? [{ to: '/sync', label: 'Sync', icon: RefreshCw }] : [],
    },
    {
      label: 'Settings',
      items: isPrivileged
        ? [
            { to: '/panel', label: 'General', icon: SlidersHorizontal },
            { to: '/features', label: 'Features', icon: ToggleLeft },
            { to: '/branding', label: 'Branding', icon: Palette },
            { to: '/users', label: 'Users', icon: UserCog },
            { to: '/system', label: 'System', icon: Server },
          ]
        : [],
    },
  ];

  return groups.filter((g) => g.items.length > 0);
}
