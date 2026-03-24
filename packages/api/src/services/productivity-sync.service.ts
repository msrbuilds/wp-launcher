import cron from 'node-cron';
import {
  getCloudConfig,
  getUnsyncedHeartbeats,
  markHeartbeatsSynced,
  addSyncLog,
  setCloudConfig,
} from './productivity.service';

const BATCH_SIZE = 1000;

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

      const response = await fetch(`${cloudUrl}/api/v1/sync/heartbeats`, {
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
  // Run every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('[productivity-sync] Starting scheduled cloud sync...');
    pushHeartbeatsToCloud().catch(err => {
      console.error('[productivity-sync] Scheduled sync error:', err.message);
    });
  });
  console.log('[productivity-sync] Scheduled cloud sync every 6 hours');
}

export async function triggerManualSync(): Promise<{ pushed: number; status: string; error?: string }> {
  return pushHeartbeatsToCloud();
}
