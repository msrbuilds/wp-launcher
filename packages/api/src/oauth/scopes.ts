import { isAdminRole } from '../services/features.service';

export const SCOPES = ['sites:read', 'sites:write', 'crm:read', 'crm:write', 'invoices:write', 'admin:read', 'admin:write'] as const;
export type Scope = typeof SCOPES[number];

/** The minimal set advertised in protected-resource metadata and the initial 401 challenge. */
export const READ_SCOPES: Scope[] = ['sites:read', 'crm:read'];

/** Consent-screen copy. `destructive` marks scopes that can delete, send or touch money. */
export const SCOPE_INFO: Record<Scope, { label: string; description: string; destructive: boolean }> = {
  'sites:read': { label: 'View your sites', description: 'List your sites and read their status, snapshots and PHP settings.', destructive: false },
  'sites:write': { label: 'Manage your sites', description: 'Launch, extend, clone, snapshot, restore and delete your sites, and open them with a one-time login link.', destructive: true },
  'crm:read': { label: 'View your Mini CRM', description: 'Read your clients, projects, boards, invoices, client messages and notifications.', destructive: false },
  'crm:write': { label: 'Manage your Mini CRM', description: 'Create, change and delete clients, projects and board cards, and send messages to your clients.', destructive: true },
  'invoices:write': { label: 'Manage invoices', description: 'Create and edit draft invoices, send them to clients, and cancel unpaid ones. Never marks anything paid.', destructive: true },
  'admin:read': { label: 'View platform reports', description: 'Read panel statistics, site logs, the user list and image builds.', destructive: false },
  'admin:write': { label: 'Manage blueprints and images', description: 'Create, edit and delete blueprints, and build or delete WordPress images.', destructive: true },
};

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

/** Parses an OAuth `scope` parameter. Returns null if any token is unknown. */
export function parseScopeParam(raw: string | undefined): Scope[] | null {
  const tokens = (raw ?? '').split(' ').filter(Boolean);
  const out: Scope[] = [];
  for (const token of tokens) {
    if (!isScope(token)) return null;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

/** Scopes a user may grant. Only staff can authorise an agent at all. */
export function scopesOfferableTo(role: string): Scope[] {
  return isAdminRole(role) ? [...SCOPES] : [];
}
