import { useState } from 'react';
import { apiFetch } from '../../../utils/api';

export interface HealthController {
  stats: Record<string, any>;
  loadingId: string | null;
  load: (siteId: string) => Promise<void>;
}

export function useHealth(): HealthController {
  const [stats, setStats] = useState<Record<string, any>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function load(siteId: string) {
    setLoadingId(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats((prev) => ({ ...prev, [siteId]: data }));
      }
    } catch { /* ignore */ }
    setLoadingId(null);
  }

  return { stats, loadingId, load };
}
