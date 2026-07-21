import { getBool, getInt } from './services/settings.service';

/**
 * Sites that never expire are stored with this sentinel rather than NULL,
 * because `sites.expires_at` is NOT NULL and every reader assumes a date.
 */
export const PERMANENT_EXPIRY = '9999-12-31T23:59:59.999Z';

/** The subset of a site row the policy layer needs. */
export interface SiteFacts {
  expires_at: string;
  restrict_capabilities: number;
  direct_file_access: number;
}

const QUOTA_ROLES: readonly string[] = ['owner', 'admin', 'member'];

function quotaKeyFor(role: string): string {
  return QUOTA_ROLES.includes(role) ? `panel.quota.${role}` : 'panel.quota.member';
}

/**
 * The single reader of install settings and per-site facts. Nothing outside this
 * module should ask what "mode" the panel is in — there isn't one.
 */
export const policy = {
  allowsPublicRegistration: (): boolean => getBool('panel.publicRegistration'),
  demoPortalEnabled: (): boolean => getBool('panel.demoPortalEnabled'),
  allowsInsecureRemotes: (): boolean => getBool('panel.allowInsecureRemotes'),
  enforcesResourceLimits: (): boolean => getBool('panel.enforceResourceLimits'),
  setupComplete: (): boolean => getBool('panel.setupComplete'),
  /** What a new site gets when the caller doesn't say. */
  defaultRestrictCapabilities: (): boolean => getBool('panel.defaultRestrictCapabilities'),

  /** 0 means unlimited. */
  quotaForRole: (role: string): number => getInt(quotaKeyFor(role)),
  /** 0 means unlimited. */
  totalSiteQuota: (): number => getInt('panel.quota.total'),

  isPermanent: (site: SiteFacts): boolean => site.expires_at >= PERMANENT_EXPIRY,
  restrictsWpCapabilities: (site: SiteFacts): boolean => site.restrict_capabilities === 1,
  exposesFiles: (site: SiteFacts): boolean => site.direct_file_access === 1,
};
