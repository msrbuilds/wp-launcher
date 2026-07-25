import cron from 'node-cron';
import { safeFetch } from '../utils/ssrf';
import {
  getCloudConfig,
  getUnsyncedHeartbeats,
  markHeartbeatsSynced,
  addSyncLog,
  setCloudConfig,
} from './productivity.service';
import { getSetting } from './settings.service';
import { isLocalDeployment } from '../utils/deployment';
import {
  DESTINATION_SETTING_KEY, parseDestination, resolveSyncEnabled,
} from './productivity-destination';

const BATCH_SIZE = 1000;

/**
 * Whether this install should be pushing to a cloud account right now. Heartbeats
 * are always stored locally; this only gates the outbound push, so a localhost
 * install stays self-contained and a public one feeds its central account.
 */
export function isCloudSyncEnabled(): boolean {
  const cfg = getCloudConfig();
  return resolveSyncEnabled({
    destination: parseDestination(getSetting(DESTINATION_SETTING_KEY)),
    cloudLinked: !!(cfg.cloud_url && cfg.cloud_api_key),
    isLocal: isLocalDeployment(),
  });
}

async function pushHeartbeatsToCloud(): Promise<{ pushed: number; status: string; error?: string }> {
  const config = getCloudConfig();
  const cloudUrl = config.cloud_url;
  const apiKey = config.cloud_api_key;

  if (!cloudUrl || !apiKey) return { pushed: 0, status: 'error', error: 'Cloud not configured' };

  let totalPushed = 0;

  try {
    while (true) {
      const heartbeats = getUnsyncedHeartbeats(BATCH_SIZE);
      if (heartbeats.length === 0) break;

      const payload = {
        heartbeats: heartbeats.map(hb => ({
          source: hb.source,
          entity: hb.entity,
          entity_type: hb.entity_type,
          project: hb.project,
          language: hb.language,
          category: hb.category,
          editor: hb.editor,
          site_id: hb.site_id,
          machine_id: hb.machine_id,
          branch: hb.branch,
          is_write: !!hb.is_write,
          created_at: hb.created_at,
        })),
        batch_id: crypto.randomUUID(),
        total_count: heartbeats.length,
      };

      // SBP-005: Use safeFetch with SSRF protection instead of raw fetch
      const response = await safeFetch(`${cloudUrl}/api/v1/sync/heartbeats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Machine-Id': config.machine_id || 'unknown',
          'X-Device-Name': config.device_name || 'WP Launcher',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Cloud sync failed: ${response.status} ${errText}`);
      }

      const ids = heartbeats.map(hb => hb.id);
      markHeartbeatsSynced(ids);
      totalPushed += heartbeats.length;
    }

    setCloudConfig('last_synced_at', new Date().toISOString());
    addSyncLog(totalPushed, 'success');
    return { pushed: totalPushed, status: 'success' };
  } catch (err: any) {
    addSyncLog(totalPushed, 'error', err.message);
    console.error('[productivity-sync] Cloud sync error:', err.message);
    return { pushed: totalPushed, status: 'error', error: err.message };
  }
}

export function startProductivitySync(): void {
  // Every 15 minutes. Each tick is a no-op unless this install is configured to
  // push, so a localhost or local-only install costs nothing but a settings read.
  cron.schedule('*/15 * * * *', () => {
    if (!isCloudSyncEnabled()) return;
    console.log('[productivity-sync] Starting scheduled cloud sync...');
    pushHeartbeatsToCloud().catch(err => {
      console.error('[productivity-sync] Scheduled sync error:', err.message);
    });
  });
  console.log('[productivity-sync] Scheduled cloud sync every 15 minutes (when a cloud destination is active)');
}

/**
 * Manual sync from the panel. Unlike the scheduled tick this does not check the
 * destination setting: an explicit "sync now" should push if an account is linked,
 * which pushHeartbeatsToCloud already requires.
 */
export async function triggerManualSync(): Promise<{ pushed: number; status: string; error?: string }> {
  return pushHeartbeatsToCloud();
}
