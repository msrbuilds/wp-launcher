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
