import { useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { TunnelInfo, TunnelMethod } from '../types';

export interface TunnelController {
  status: Record<string, TunnelInfo>;
  creatingId: string | null;
  method: TunnelMethod;
  setMethod: (m: TunnelMethod) => void;
  ngrokToken: string;
  setNgrokToken: (v: string) => void;
  copied: boolean;
  copyUrl: (url: string) => void;
  load: (siteId: string, poll?: boolean) => Promise<void>;
  create: (siteId: string) => Promise<void>;
  remove: (siteId: string) => Promise<void>;
}

export function useTunnel(): TunnelController {
  const [status, setStatus] = useState<Record<string, TunnelInfo>>({});
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [method, setMethod] = useState<TunnelMethod>('cloudflare');
  const [ngrokToken, setNgrokToken] = useState('');
  const [copied, setCopied] = useState(false);

  async function load(siteId: string, poll = false) {
    try {
      const res = await apiFetch(`/api/sites/${siteId}/tunnel`);
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => ({ ...prev, [siteId]: data }));
        if (poll && data.active && data.status === 'connecting') {
          setTimeout(() => load(siteId, true), 2000);
        }
      }
    } catch { /* ignore */ }
  }

  async function create(siteId: string) {
    setCreatingId(siteId);
    try {
      const body: any = { method };
      if (method === 'ngrok') body.ngrokAuthToken = ngrokToken;
      const res = await apiFetch(`/api/sites/${siteId}/tunnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create tunnel' }));
        alert(err.error || 'Failed to create tunnel');
        return;
      }
      setTimeout(() => load(siteId, true), 2000);
      setStatus((prev) => ({ ...prev, [siteId]: { active: true, method, url: null, status: 'connecting' } }));
    } catch {
      alert('Failed to create tunnel');
    } finally {
      setCreatingId(null);
    }
  }

  async function remove(siteId: string) {
    try {
      await apiFetch(`/api/sites/${siteId}/tunnel`, { method: 'DELETE' });
      setStatus((prev) => ({ ...prev, [siteId]: { active: false } }));
    } catch { /* ignore */ }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return {
    status, creatingId, method, setMethod, ngrokToken, setNgrokToken,
    copied, copyUrl, load, create, remove,
  };
}
