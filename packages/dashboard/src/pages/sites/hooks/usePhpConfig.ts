import { useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { DEFAULT_PHP_CONFIG, PhpConfig } from '../types';

export interface PhpController {
  configs: Record<string, PhpConfig>;
  get: (siteId: string) => PhpConfig;
  loadingId: string | null;
  savingId: string | null;
  saveMsg: Record<string, string>;
  load: (siteId: string) => Promise<void>;
  update: (siteId: string, field: keyof PhpConfig, value: unknown) => void;
  toggleExtension: (siteId: string, ext: string) => void;
  save: (siteId: string) => Promise<void>;
}

export function usePhpConfig(): PhpController {
  const [configs, setConfigs] = useState<Record<string, PhpConfig>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function get(siteId: string): PhpConfig {
    return configs[siteId] || { ...DEFAULT_PHP_CONFIG };
  }

  async function load(siteId: string) {
    setLoadingId(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/php-config`);
      if (res.ok) {
        const data = await res.json();
        setConfigs((prev) => ({
          ...prev,
          [siteId]: {
            memoryLimit: data.memoryLimit || DEFAULT_PHP_CONFIG.memoryLimit,
            uploadMaxFilesize: data.uploadMaxFilesize || DEFAULT_PHP_CONFIG.uploadMaxFilesize,
            postMaxSize: data.postMaxSize || DEFAULT_PHP_CONFIG.postMaxSize,
            maxExecutionTime: data.maxExecutionTime || DEFAULT_PHP_CONFIG.maxExecutionTime,
            maxInputVars: data.maxInputVars || DEFAULT_PHP_CONFIG.maxInputVars,
            displayErrors: data.displayErrors || DEFAULT_PHP_CONFIG.displayErrors,
            extensions: Array.isArray(data.extensions) ? data.extensions : [],
          },
        }));
      }
    } catch {
      // Fall back to defaults silently
    } finally {
      setLoadingId(null);
    }
  }

  function update(siteId: string, field: keyof PhpConfig, value: unknown) {
    setConfigs((prev) => ({
      ...prev,
      [siteId]: { ...(prev[siteId] || { ...DEFAULT_PHP_CONFIG }), [field]: value },
    }));
  }

  function toggleExtension(siteId: string, ext: string) {
    const cfg = get(siteId);
    const exts = cfg.extensions.includes(ext)
      ? cfg.extensions.filter((e) => e !== ext)
      : [...cfg.extensions, ext];
    update(siteId, 'extensions', exts);
  }

  async function save(siteId: string) {
    setSavingId(siteId);
    setSaveMsg((prev) => ({ ...prev, [siteId]: '' }));
    try {
      const cfg = get(siteId);
      const res = await apiFetch(`/api/sites/${siteId}/php-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memoryLimit: cfg.memoryLimit,
          uploadMaxFilesize: cfg.uploadMaxFilesize,
          postMaxSize: cfg.postMaxSize,
          maxExecutionTime: cfg.maxExecutionTime,
          maxInputVars: cfg.maxInputVars,
          displayErrors: cfg.displayErrors,
          extensions: cfg.extensions.length > 0 ? cfg.extensions.join(',') : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      setSaveMsg((prev) => ({ ...prev, [siteId]: 'Applied! Apache reloaded.' }));
      setTimeout(() => setSaveMsg((prev) => ({ ...prev, [siteId]: '' })), 3000);
    } catch (err: any) {
      setSaveMsg((prev) => ({ ...prev, [siteId]: `Error: ${err.message}` }));
    } finally {
      setSavingId(null);
    }
  }

  return { configs, get, loadingId, savingId, saveMsg, load, update, toggleExtension, save };
}
