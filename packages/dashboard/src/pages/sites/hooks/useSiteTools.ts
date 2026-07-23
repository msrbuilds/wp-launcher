import { useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { useToast } from '../../../components/Toast';
import { PasswordScope, Site } from '../types';

export interface DbCredentials {
  site: Site;
  host: string;
  user: string;
  password: string;
  database: string;
  dbEngine: string;
  adminerUrl: string;
}

export interface SiteToolsController {
  cloningId: string | null;
  clone: (siteId: string) => Promise<void>;
  exportingId: string | null;
  exportZip: (siteId: string) => Promise<void>;
  autoLogin: (siteId: string, fallbackUrl: string) => Promise<void>;
  extend: (siteId: string, duration: string) => Promise<void>;

  templateSiteId: string | null;
  openTemplateDialog: (siteId: string) => void;
  closeTemplateDialog: () => void;
  templateId: string;
  setTemplateId: (v: string) => void;
  templateName: string;
  setTemplateName: (v: string) => void;
  templateSaving: boolean;
  templateError: string;
  exportTemplate: (siteId: string) => Promise<void>;

  passwordSiteId: string | null;
  openPasswordDialog: (siteId: string) => void;
  closePasswordDialog: () => void;
  passwordValue: string;
  setPasswordValue: (v: string) => void;
  passwordScope: PasswordScope;
  setPasswordScope: (v: PasswordScope) => void;
  passwordLoadingId: string | null;
  setPassword: (siteId: string) => Promise<void>;
  removePassword: (siteId: string) => Promise<void>;

  dbModal: DbCredentials | null;
  closeDbModal: () => void;
  openAdminer: (site: Site) => Promise<void>;
  dbCopied: string;
  copyDbField: (value: string, field: string) => void;
}

export function useSiteTools(onSitesChanged: () => void): SiteToolsController {
  const toast = useToast();
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const [templateSiteId, setTemplateSiteId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState('');

  const [passwordSiteId, setPasswordSiteId] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordScope, setPasswordScope] = useState<PasswordScope>('frontend');
  const [passwordLoadingId, setPasswordLoadingId] = useState<string | null>(null);

  const [dbModal, setDbModal] = useState<DbCredentials | null>(null);
  const [dbCopied, setDbCopied] = useState('');

  async function clone(siteId: string) {
    if (!confirm('Clone this site? A new site will be created with the same content.')) return;
    setCloningId(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        onSitesChanged();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to clone site');
      }
    } catch {
      toast.error('Failed to clone site');
    } finally {
      setCloningId(null);
    }
  }

  async function exportZip(siteId: string) {
    setExportingId(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/export-zip`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to export' }));
        toast.error(err.error || 'Failed to export site');
        return;
      }
      const data = await res.json();
      if (!data.downloadUrl) {
        toast.error('Export failed: no download URL returned');
        return;
      }
      // Download with credentials and trigger browser save
      const dlRes = await apiFetch(data.downloadUrl);
      if (!dlRes.ok) {
        toast.error('Download failed');
        return;
      }
      const blob = await dlRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'site-export.tar.gz';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export site');
    } finally {
      setExportingId(null);
    }
  }

  async function autoLogin(siteId: string, fallbackUrl: string) {
    try {
      const res = await apiFetch(`/api/sites/${siteId}/autologin`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        window.open(data.autoLoginUrl, '_blank');
      } else {
        window.open(fallbackUrl, '_blank');
      }
    } catch {
      window.open(fallbackUrl, '_blank');
    }
  }

  async function extend(siteId: string, duration: string) {
    try {
      const res = await apiFetch(`/api/sites/${siteId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to extend site' }));
        toast.error(err.error || 'Failed to extend site');
        return;
      }
      onSitesChanged();
    } catch {
      toast.error('Failed to extend site');
    }
  }

  function openTemplateDialog(siteId: string) {
    setTemplateSiteId(siteId);
    setTemplateId('');
    setTemplateName('');
    setTemplateError('');
  }

  function closeTemplateDialog() {
    setTemplateSiteId(null);
  }

  async function exportTemplate(siteId: string) {
    if (!templateId.trim()) {
      setTemplateError('Template ID is required');
      return;
    }
    setTemplateSaving(true);
    setTemplateError('');
    try {
      const res = await apiFetch(`/api/sites/${siteId}/export-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: templateId.trim(),
          templateName: templateName.trim() || templateId.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTemplateSiteId(null);
        setTemplateId('');
        setTemplateName('');
        toast.success(`Template "${data.name}" saved. It will appear in your templates list.`);
      } else {
        const data = await res.json();
        setTemplateError(data.error || 'Failed to export template');
      }
    } catch {
      setTemplateError('Failed to export template');
    } finally {
      setTemplateSaving(false);
    }
  }

  function openPasswordDialog(siteId: string) {
    setPasswordSiteId(siteId);
    setPasswordValue('');
  }

  function closePasswordDialog() {
    setPasswordSiteId(null);
  }

  async function setPassword(siteId: string) {
    setPasswordLoadingId(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordValue || null, scope: passwordScope }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        toast.error(err.error || 'Failed to set password');
        return;
      }
      setPasswordSiteId(null);
      setPasswordValue('');
    } catch {
      toast.error('Failed to set password');
    } finally {
      setPasswordLoadingId(null);
    }
  }

  async function removePassword(siteId: string) {
    setPasswordLoadingId(siteId);
    try {
      await apiFetch(`/api/sites/${siteId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: null }),
      });
    } catch { /* ignore */ }
    setPasswordLoadingId(null);
  }

  async function openAdminer(site: Site) {
    try {
      const res = await apiFetch(`/api/sites/${site.id}/db-credentials`, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to get database credentials' }));
        toast.error(err.error || 'Failed to get database credentials');
        return;
      }
      const data = await res.json();
      if (!data.supported) {
        toast.show(data.message || 'This site uses SQLite and does not support Adminer');
        return;
      }
      console.log('[DB Modal] Setting credentials:', data);
      setDbModal({
        site,
        host: data.host,
        user: data.user,
        password: data.password,
        database: data.database,
        dbEngine: data.dbEngine,
        adminerUrl: data.adminerUrl,
      });
      setDbCopied('');
    } catch {
      toast.error('Failed to get database credentials');
    }
  }

  function copyDbField(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setDbCopied(field);
    setTimeout(() => setDbCopied(''), 2000);
  }

  return {
    cloningId, clone, exportingId, exportZip, autoLogin, extend,
    templateSiteId, openTemplateDialog, closeTemplateDialog,
    templateId, setTemplateId, templateName, setTemplateName,
    templateSaving, templateError, exportTemplate,
    passwordSiteId, openPasswordDialog, closePasswordDialog,
    passwordValue, setPasswordValue, passwordScope, setPasswordScope,
    passwordLoadingId, setPassword, removePassword,
    dbModal, closeDbModal: () => setDbModal(null), openAdminer, dbCopied, copyDbField,
  };
}
