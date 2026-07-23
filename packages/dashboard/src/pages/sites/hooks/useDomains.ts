import { useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { DomainInfo } from '../types';

export interface DomainsController {
  input: Record<string, string>;
  setInput: (siteId: string, value: string) => void;
  status: Record<string, DomainInfo>;
  savingId: string | null;
  recheckingId: string | null;
  errors: Record<string, string>;
  load: (siteId: string, showLoading?: boolean) => Promise<void>;
  save: (siteId: string) => Promise<void>;
  remove: (siteId: string) => Promise<void>;
}

export function useDomains(): DomainsController {
  const [input, setInputState] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, DomainInfo>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  function setInput(siteId: string, value: string) {
    setInputState((prev) => ({ ...prev, [siteId]: value }));
  }

  async function load(siteId: string, showLoading = false) {
    if (showLoading) setRecheckingId(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/domain`);
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => ({ ...prev, [siteId]: data }));
        if (data.domain) setInputState((prev) => ({ ...prev, [siteId]: data.domain }));
      }
    } catch { /* ignore */ }
    finally { if (showLoading) setRecheckingId(null); }
  }

  async function save(siteId: string) {
    const domain = (input[siteId] || '').trim();
    if (!domain) return;
    setSavingId(siteId);
    setErrors((prev) => ({ ...prev, [siteId]: '' }));
    try {
      const res = await apiFetch(`/api/sites/${siteId}/domain`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => ({ ...prev, [siteId]: data }));
      } else {
        const data = await res.json();
        setErrors((prev) => ({ ...prev, [siteId]: data.error || 'Failed to set domain' }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [siteId]: 'Failed to set domain' }));
    } finally {
      setSavingId(null);
    }
  }

  async function remove(siteId: string) {
    if (!confirm('Remove custom domain?')) return;
    setSavingId(siteId);
    try {
      await apiFetch(`/api/sites/${siteId}/domain`, { method: 'DELETE' });
      setStatus((prev) => ({ ...prev, [siteId]: { domain: null, status: 'none' } }));
      setInputState((prev) => ({ ...prev, [siteId]: '' }));
    } catch { /* ignore */ }
    finally { setSavingId(null); }
  }

  return { input, setInput, status, savingId, recheckingId, errors, load, save, remove };
}
