import { useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { ShareRole } from '../types';

export interface SharesController {
  email: string;
  setEmail: (v: string) => void;
  role: ShareRole;
  setRole: (v: ShareRole) => void;
  loading: boolean;
  message: string;
  bySite: Record<string, any[]>;
  sharedWithMe: any[];
  load: (siteId: string) => Promise<void>;
  loadSharedWithMe: () => void;
  share: (siteId: string) => Promise<void>;
  revoke: (siteId: string, shareId: string) => Promise<void>;
}

export function useShares(enabled: boolean): SharesController {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('viewer');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [bySite, setBySite] = useState<Record<string, any[]>>({});
  const [sharedWithMe, setSharedWithMe] = useState<any[]>([]);

  async function load(siteId: string) {
    try {
      const res = await apiFetch(`/api/sites/${siteId}/shares`);
      if (res.ok) {
        const data = await res.json();
        setBySite((prev) => ({ ...prev, [siteId]: data.shares || [] }));
      }
    } catch { /* ignore */ }
  }

  function loadSharedWithMe() {
    if (!enabled) return;
    apiFetch('/api/sites/shared-with-me')
      .then((r) => r.json())
      .then((data) => { if (data.sites) setSharedWithMe(data.sites); })
      .catch(() => {});
  }

  async function share(siteId: string) {
    if (!email) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await apiFetch(`/api/sites/${siteId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (res.ok) {
        setEmail('');
        setMessage('Shared successfully!');
        load(siteId);
        setTimeout(() => setMessage(''), 3000);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        setMessage(err.error || 'Failed to share');
      }
    } catch {
      setMessage('Failed to share');
    } finally {
      setLoading(false);
    }
  }

  async function revoke(siteId: string, shareId: string) {
    await apiFetch(`/api/sites/${siteId}/shares/${shareId}`, { method: 'DELETE' });
    load(siteId);
  }

  return {
    email, setEmail, role, setRole, loading, message,
    bySite, sharedWithMe, load, loadSharedWithMe, share, revoke,
  };
}
