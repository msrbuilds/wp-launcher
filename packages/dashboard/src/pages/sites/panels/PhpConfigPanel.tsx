import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AVAILABLE_EXTENSIONS, PhpConfig } from '../types';
import { PhpController } from '../hooks/usePhpConfig';

const SELECT_FIELDS: { key: keyof PhpConfig; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'memoryLimit', label: 'Memory Limit', options: [
      { value: '128M', label: '128 MB' }, { value: '256M', label: '256 MB' },
      { value: '512M', label: '512 MB' }, { value: '1G', label: '1 GB' },
      { value: '2G', label: '2 GB' }, { value: '-1', label: 'Unlimited' },
    ],
  },
  {
    key: 'uploadMaxFilesize', label: 'Upload Max', options: [
      { value: '2M', label: '2 MB' }, { value: '16M', label: '16 MB' },
      { value: '64M', label: '64 MB' }, { value: '128M', label: '128 MB' },
      { value: '256M', label: '256 MB' }, { value: '512M', label: '512 MB' },
      { value: '1G', label: '1 GB' }, { value: '2G', label: '2 GB' },
      { value: '0', label: 'Unlimited' },
    ],
  },
  {
    key: 'postMaxSize', label: 'Post Max Size', options: [
      { value: '8M', label: '8 MB' }, { value: '16M', label: '16 MB' },
      { value: '64M', label: '64 MB' }, { value: '128M', label: '128 MB' },
      { value: '256M', label: '256 MB' }, { value: '512M', label: '512 MB' },
      { value: '1G', label: '1 GB' }, { value: '2G', label: '2 GB' },
      { value: '0', label: 'Unlimited' },
    ],
  },
  {
    key: 'maxExecutionTime', label: 'Max Exec Time', options: [
      { value: '30', label: '30s' }, { value: '60', label: '60s' },
      { value: '120', label: '120s' }, { value: '300', label: '300s' },
      { value: '0', label: 'Unlimited' },
    ],
  },
  {
    key: 'maxInputVars', label: 'Max Input Vars', options: [
      { value: '1000', label: '1,000' }, { value: '3000', label: '3,000' },
      { value: '5000', label: '5,000' }, { value: '10000', label: '10,000' },
    ],
  },
  {
    key: 'displayErrors', label: 'Display Errors', options: [
      { value: 'On', label: 'On' }, { value: 'Off', label: 'Off' },
    ],
  },
];

const TEXT_FIELDS: { key: keyof PhpConfig; label: string }[] = [
  { key: 'memoryLimit', label: 'Memory' },
  { key: 'uploadMaxFilesize', label: 'Upload Max' },
  { key: 'postMaxSize', label: 'Post Max' },
  { key: 'maxExecutionTime', label: 'Max Exec Time' },
  { key: 'maxInputVars', label: 'Max Input Vars' },
  { key: 'displayErrors', label: 'Display Errors' },
];

interface Props {
  siteId: string;
  php: PhpController;
  variant?: 'full' | 'compact';
}

export default function PhpConfigPanel({ siteId, php, variant = 'full' }: Props) {
  const cfg = php.get(siteId);
  const msg = php.saveMsg[siteId];

  if (php.loadingId === siteId) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading PHP config...
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {TEXT_FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Input
              className="h-8 rounded-lg text-sm"
              value={String(cfg[key] ?? '')}
              onChange={(e) => php.update(siteId, key, e.target.value)}
            />
          </div>
        ))}
        <div className="col-span-2 flex items-center gap-3">
          <Button size="xs" onClick={() => php.save(siteId)} disabled={php.savingId === siteId}>
            {php.savingId === siteId ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save PHP Config'}
          </Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        {SELECT_FIELDS.map(({ key, label, options }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Select
              value={String(cfg[key] ?? '')}
              onValueChange={(value) => php.update(siteId, key, value)}
            >
              <SelectTrigger size="sm" className="w-full rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Label className="text-xs text-muted-foreground">Extensions</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVAILABLE_EXTENSIONS.map((ext) => {
            const active = cfg.extensions.includes(ext.value);
            return (
              <Button
                key={ext.value}
                type="button"
                size="xs"
                variant={active ? 'default' : 'outline'}
                className={cn('rounded-lg', !active && 'text-muted-foreground')}
                onClick={() => php.toggleExtension(siteId, ext.value)}
              >
                {ext.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button size="xs" onClick={() => php.save(siteId)} disabled={php.savingId === siteId}>
          {php.savingId === siteId
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Applying...</>
            : 'Save & Apply'}
        </Button>
        {msg && (
          <span className={cn('text-xs', msg.startsWith('Error') ? 'text-destructive' : 'text-emerald-600')}>
            {msg}
          </span>
        )}
      </div>
    </>
  );
}
