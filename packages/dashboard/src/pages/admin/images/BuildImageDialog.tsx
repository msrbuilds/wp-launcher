import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '../../../utils/api';
import { useToast } from '../../../components/Toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PHP_VERSIONS, STATIC_WP_BY_PHP } from './php-versions';

/**
 * Builds a base WordPress runtime image from a PHP + WordPress pairing. The
 * version lists come live from GET /api/admin/images/versions (Docker Hub tags),
 * so current releases appear without a code change; a static baseline is used if
 * that fetch fails. Plugins and themes are configured per-blueprint.
 */
export function BuildImageDialog({ open, onOpenChange, onStarted }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStarted: (jobId: string, tag: string) => void;
}) {
  const toast = useToast();
  const [phpVersions, setPhpVersions] = useState<string[]>(PHP_VERSIONS);
  const [wpByPhp, setWpByPhp] = useState<Record<string, string[]>>(STATIC_WP_BY_PHP);
  const [phpVersion, setPhpVersion] = useState('8.3');
  const [wpVersion, setWpVersion] = useState('6.9');
  const [submitting, setSubmitting] = useState(false);

  // Load the live buildable matrix each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    apiFetch('/api/admin/images/versions')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.wpByPhp) return;
        setWpByPhp(data.wpByPhp);
        if (Array.isArray(data.phpVersions) && data.phpVersions.length) setPhpVersions(data.phpVersions);
      })
      .catch(() => { /* keep the static fallback */ });
    return () => { active = false; };
  }, [open]);

  const wpOptions = wpByPhp[phpVersion] || [];

  // Keep the WP selection valid (and defaulted to newest) as PHP or the matrix change.
  useEffect(() => {
    const opts = wpByPhp[phpVersion] || [];
    if (opts.length && !opts.includes(wpVersion)) setWpVersion(opts[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phpVersion, wpByPhp]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/images/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phpVersion, wpVersion }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Failed to start build'); return; }
      onStarted(data.jobId, data.tag);
      onOpenChange(false);
    } catch {
      toast.error('Failed to start build');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Build base image</DialogTitle>
          <DialogDescription>
            Pick a PHP and WordPress version. Plugins and themes are set per blueprint, not baked in here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="img-php">PHP version</Label>
            <Select value={phpVersion} onValueChange={setPhpVersion}>
              <SelectTrigger id="img-php" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {phpVersions.map((v) => <SelectItem key={v} value={v}>PHP {v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="img-wp">WordPress version</Label>
            <Select value={wpVersion} onValueChange={setWpVersion}>
              <SelectTrigger id="img-wp" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {wpOptions.map((v) => <SelectItem key={v} value={v}>WordPress {v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !wpVersion}>
            {submitting ? <><Loader2 className="animate-spin" />Starting…</> : 'Build image'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
