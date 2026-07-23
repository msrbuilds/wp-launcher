import { useState } from 'react';
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
import { PHP_VERSIONS, allowedWpVersions } from './php-versions';

/**
 * Builds a base WordPress runtime image from a PHP + WordPress pairing. Plugins
 * and themes are configured per-blueprint, not baked into the image.
 */
export function BuildImageDialog({ open, onOpenChange, onStarted }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStarted: (jobId: string, tag: string) => void;
}) {
  const toast = useToast();
  const [phpVersion, setPhpVersion] = useState('8.3');
  const [wpVersion, setWpVersion] = useState('6.9');
  const [submitting, setSubmitting] = useState(false);

  const wpOptions = allowedWpVersions(phpVersion);

  // When PHP changes, keep WP valid for it (7.4 only allows 6.1).
  function onPhpChange(v: string) {
    setPhpVersion(v);
    const allowed = allowedWpVersions(v);
    if (!allowed.includes(wpVersion)) setWpVersion(allowed[0]);
  }

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
      setPhpVersion('8.3'); setWpVersion('6.9');
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
            <Select value={phpVersion} onValueChange={onPhpChange}>
              <SelectTrigger id="img-php" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PHP_VERSIONS.map((v) => <SelectItem key={v} value={v}>PHP {v}</SelectItem>)}
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
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <><Loader2 className="animate-spin" />Starting…</> : 'Build image'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
