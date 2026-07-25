import { getDb } from '../utils/db';

/**
 * Feature resolution. There are two audiences: the panel operator (owner/admin)
 * and members who launch their own sites. The operator's flags stay in the
 * original `feature.<key>` rows; members read a separate `feature.demo.<key>`
 * namespace that starts empty, so enabling something for yourself never grants
 * it to a self-service signup.
 */

/** Never available to a member — no `feature.demo.*` counterpart exists. */
export const ADMIN_ONLY_FEATURES: readonly string[] = [
  'projects',
  'productivityMonitor',
  'siteSync',
  'webhooks',
  // Invites other users by email: an access-granting and outbound-mail vector
  // that should not sit behind self-service signup.
  'collaborativeSites',
];

/** Per-site capabilities an admin may grant to members. */
export const GRANTABLE_FEATURES: readonly string[] = [
  'cloning',
  'snapshots',
  'templates',
  'customDomains',
  'phpConfig',
  'siteExtend',
  'sitePassword',
  'exportZip',
  'healthMonitoring',
  'scheduledLaunch',
  'adminer',
  'publicSharing',
];

export const ALL_FEATURES: readonly string[] = [...ADMIN_ONLY_FEATURES, ...GRANTABLE_FEATURES];

/** A role string from the request, or undefined for an anonymous caller. */
export type FeatureRole = string | undefined;

export function isAdminRole(role: FeatureRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function isAdminOnlyFeature(key: string): boolean {
  return ADMIN_ONLY_FEATURES.includes(key);
}

export function adminSettingKey(key: string): string {
  return `feature.${key}`;
}

export function demoSettingKey(key: string): string {
  return `feature.demo.${key}`;
}

/**
 * The two toggles are independent by design: an operator may run a capability
 * for themselves without offering it to members, or vice versa. Anonymous
 * callers resolve as members so a missing token can never widen access.
 */
export function resolveFeature(input: {
  key: string;
  role: FeatureRole;
  adminOn: boolean;
  demoOn: boolean;
}): boolean {
  if (!ALL_FEATURES.includes(input.key)) return false;
  if (isAdminRole(input.role)) return input.adminOn;
  if (isAdminOnlyFeature(input.key)) return false;
  return input.demoOn;
}

function readFlag(settingKey: string): boolean {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(settingKey) as { value: string } | undefined;
  return row?.value === 'true';
}

/** Is `key` available to a caller with this role? */
export function isFeatureEnabled(key: string, role: FeatureRole): boolean {
  if (!ALL_FEATURES.includes(key)) return false;
  // Read only the namespace this role actually resolves against.
  if (isAdminRole(role)) {
    return resolveFeature({ key, role, adminOn: readFlag(adminSettingKey(key)), demoOn: false });
  }
  if (isAdminOnlyFeature(key)) return false;
  return resolveFeature({ key, role, adminOn: false, demoOn: readFlag(demoSettingKey(key)) });
}

/** Every feature resolved for this role — what the dashboard should render from. */
export function effectiveFeatures(role: FeatureRole): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of ALL_FEATURES) out[key] = isFeatureEnabled(key, role);
  return out;
}
