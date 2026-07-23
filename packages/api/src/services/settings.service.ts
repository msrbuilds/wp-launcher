import { getDb } from '../utils/db';
import { PANEL_DEFAULTS } from '../utils/migrations/panel-v3';

export type PanelSettingKey = string;

export function getSetting(key: PanelSettingKey): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? PANEL_DEFAULTS[key] ?? '';
}

export function getBool(key: PanelSettingKey): boolean {
  return getSetting(key) === 'true';
}

export function getInt(key: PanelSettingKey): number {
  const parsed = parseInt(getSetting(key), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function setSetting(key: PanelSettingKey, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

/** Every `panel.*` row, for the settings API and the admin UI. */
export function getPanelSettings(): Record<string, string> {
  const out: Record<string, string> = { ...PANEL_DEFAULTS };
  const rows = getDb().prepare("SELECT key, value FROM settings WHERE key LIKE 'panel.%'").all() as {
    key: string;
    value: string;
  }[];
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * What an admin may change from the panel. `panel.setupComplete` and
 * `panel.migratedFrom` are deliberately absent — they are lifecycle facts owned
 * by the installer, and letting them be edited could lock an install out of
 * itself or re-trigger the setup wizard.
 */
const EDITABLE: Record<string, 'bool' | 'int' | 'expiry'> = {
  'panel.publicRegistration': 'bool',
  'panel.demoPortalEnabled': 'bool',
  'panel.allowInsecureRemotes': 'bool',
  'panel.enforceResourceLimits': 'bool',
  'panel.defaultRestrictCapabilities': 'bool',
  'panel.defaultExpiry': 'expiry',
  'panel.quota.owner': 'int',
  'panel.quota.admin': 'int',
  'panel.quota.member': 'int',
  'panel.quota.total': 'int',
};

/** `permanent`, or a duration the site lifecycle already understands. */
const EXPIRY_PATTERN = /^(permanent|\d+[hdmw])$/;

export class SettingValidationError extends Error {}

/**
 * Write the supplied `panel.*` values, rejecting unknown keys and bad shapes.
 * Returns the settings as they stand afterwards.
 */
export function updatePanelSettings(input: Record<string, unknown>): Record<string, string> {
  const writes: [string, string][] = [];

  for (const [key, raw] of Object.entries(input)) {
    const kind = EDITABLE[key];
    if (!kind) throw new SettingValidationError(`Unknown or read-only setting: ${key}`);

    if (kind === 'bool') {
      if (typeof raw !== 'boolean') throw new SettingValidationError(`${key} must be true or false`);
      writes.push([key, raw ? 'true' : 'false']);
    } else if (kind === 'int') {
      const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      if (!Number.isInteger(n) || n < 0) throw new SettingValidationError(`${key} must be 0 or a positive whole number`);
      writes.push([key, String(n)]);
    } else {
      const v = String(raw).trim();
      if (!EXPIRY_PATTERN.test(v)) {
        throw new SettingValidationError(`${key} must be "permanent" or a duration like 24h, 7d, 2w`);
      }
      writes.push([key, v]);
    }
  }

  for (const [key, value] of writes) setSetting(key, value);
  return getPanelSettings();
}
