import { useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { Snapshot } from '../types';

export interface SnapshotsController {
  bySite: Record<string, Snapshot[]>;
  busyId: string | null;
  load: (siteId: string) => Promise<void>;
  take: (siteId: string) => Promise<void>;
  restore: (siteId: string, snapshotId: string) => Promise<void>;
  remove: (siteId: string, snapshotId: string) => Promise<void>;
}

export function useSnapshots(): SnapshotsController {
  const [bySite, setBySite] = useState<Record<string, Snapshot[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(siteId: string) {
    try {
      const res = await apiFetch(`/api/sites/${siteId}/snapshots`);
      if (res.ok) {
        const data = await res.json();
        setBySite((prev) => ({ ...prev, [siteId]: data }));
      }
    } catch { /* ignore */ }
  }

  async function take(siteId: string) {
    const name = prompt('Snapshot name (optional):') ?? undefined;
    setBusyId(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        await load(siteId);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to take snapshot');
      }
    } catch {
      alert('Failed to take snapshot');
    } finally {
      setBusyId(null);
    }
  }

  async function restore(siteId: string, snapshotId: string) {
    if (!confirm('Restore this snapshot? Current site data will be replaced.')) return;
    setBusyId(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/snapshots/${snapshotId}/restore`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to restore');
      }
    } catch {
      alert('Failed to restore snapshot');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(siteId: string, snapshotId: string) {
    if (!confirm('Delete this snapshot?')) return;
    try {
      await apiFetch(`/api/sites/${siteId}/snapshots/${snapshotId}`, { method: 'DELETE' });
      await load(siteId);
    } catch { /* ignore */ }
  }

  return { bySite, busyId, load, take, restore, remove };
}
