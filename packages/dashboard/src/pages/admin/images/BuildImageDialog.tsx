import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PluginEntry, ThemeEntry } from '../../../types/product';
import PluginRepeater from '../../../components/PluginRepeater';
import ThemeRepeater from '../../../components/ThemeRepeater';
import { apiFetch } from '../../../utils/api';
import { useToast } from '../../../components/Toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PHP_VERSIONS } from './php-versions';

// Map a repeater entry to the build-spec source shape. Only the fields the
// server reads are sent; 'activate' and 'remove defaults' don't apply to a
// baked image and are ignored here.
function toSource(e: PluginEntry | ThemeEntry) {
  if (e.source === 'local') return { source: 'local' as const };
  if (e.source === 'url') return { source: 'url' as const, url: e.url };
  return { source: 'wordpress.org' as const, slug: e.slug };
}

export function BuildImageDialog({ open, onOpenChange, onStarted }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStarted: (jobId: string, tag: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [phpVersion, setPhpVersion] = useState('8.3');
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [removePlugins, setRemovePlugins] = useState('');
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [removeThemes, setRemoveThemes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error('Image name is required'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('spec', JSON.stringify({
        kind: 'custom',
        name: name.trim(),
        tag: tag.trim() || undefined,
        phpVersion,
        plugins: plugins.map(toSource),
        themes: themes.map(toSource),
      }));
      // Uploaded zips, in the same order their 'local' entries appear.
      plugins.filter((p) => p.source === 'local' && p.file).forEach((p) => fd.append('plugin_files', p.file as File));
      themes.filter((t) => t.source === 'local' && t.file).forEach((t) => fd.append('theme_files', t.file as File));

      const res = await apiFetch('/api/admin/images/builds', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Failed to start build'); return; }
      onStarted(data.jobId, data.tag);
      onOpenChange(false);
      setName(''); setTag(''); setPhpVersion('8.3'); setPlugins([]); setThemes([]);
    } catch {
      toast.error('Failed to start build');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Build custom image</DialogTitle>
          <DialogDescription>
            Bake plugins and themes into a reusable WordPress image. The base PHP image is built automatically if missing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="img-name">Image name</Label>
              <Input id="img-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. woo-shop" />
              <span className="text-xs text-muted-foreground">Becomes wp-launcher/&lt;name&gt;:&lt;tag&gt;.</span>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="img-tag">Tag <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="img-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="latest" />
            </div>
          </div>

          <div className="flex flex-col gap-2 md:w-48">
            <Label htmlFor="img-php">PHP version</Label>
            <Select value={phpVersion} onValueChange={setPhpVersion}>
              <SelectTrigger id="img-php" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PHP_VERSIONS.map((v) => <SelectItem key={v} value={v}>PHP {v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-3 block">Plugins</Label>
            <PluginRepeater
              plugins={plugins}
              onChange={setPlugins}
              removePlugins={removePlugins}
              onRemovePluginsChange={setRemovePlugins}
            />
          </div>

          <div>
            <Label className="mb-3 block">Themes</Label>
            <ThemeRepeater
              themes={themes}
              onChange={setThemes}
              removeThemes={removeThemes}
              onRemoveThemesChange={setRemoveThemes}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? <><Loader2 className="animate-spin" />Starting…</> : 'Build image'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
