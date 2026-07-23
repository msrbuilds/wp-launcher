import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { HealthController } from '../hooks/useHealth';
import { formatDuration, meterTextClass } from '../types';

interface Props {
  siteId: string;
  health: HealthController;
  variant?: 'full' | 'compact';
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export default function HealthPanel({ siteId, health, variant = 'full' }: Props) {
  const stats = health.stats[siteId];

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stats...
      </div>
    );
  }

  const memPercent = Math.min(stats.memory.percent, 100);

  return (
    <div
      className={cn(
        'grid gap-3',
        variant === 'full'
          ? 'grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]'
          : 'grid-cols-2',
      )}
    >
      <Tile label="CPU">
        <div className={cn('text-xl font-semibold', meterTextClass(stats.cpu.percent))}>
          {stats.cpu.percent}%
        </div>
        {variant === 'full' && (
          <div className="text-xs text-muted-foreground">{stats.cpu.cores} core(s)</div>
        )}
      </Tile>

      <Tile label="Memory">
        <div className={cn('text-xl font-semibold', meterTextClass(stats.memory.percent))}>
          {stats.memory.usedMB} MB
        </div>
        {variant === 'full' && (
          <div className="text-xs text-muted-foreground">
            {stats.memory.percent}% of {stats.memory.limitMB} MB
          </div>
        )}
        <Progress
          value={memPercent}
          className={cn(
            'mt-2',
            stats.memory.percent > 80
              ? '[&>[data-slot=progress-indicator]]:bg-destructive'
              : '[&>[data-slot=progress-indicator]]:bg-emerald-500',
          )}
        />
      </Tile>

      <Tile label="Network">
        {variant === 'full' ? (
          <>
            <div className="text-sm font-medium">
              {(stats.network.rxBytes / 1024 / 1024).toFixed(1)} MB in
            </div>
            <div className="text-sm font-medium">
              {(stats.network.txBytes / 1024 / 1024).toFixed(1)} MB out
            </div>
          </>
        ) : (
          <div className="text-sm font-medium">
            {(stats.network.rxBytes / 1024 / 1024).toFixed(1)} MB in /{' '}
            {(stats.network.txBytes / 1024 / 1024).toFixed(1)} MB out
          </div>
        )}
      </Tile>

      <Tile label="Uptime">
        <div className="text-sm font-medium">
          {formatDuration(Date.now() - new Date(stats.uptime).getTime())}
        </div>
        {variant === 'full' && (
          <div className="text-xs text-muted-foreground">PID {stats.pid}</div>
        )}
      </Tile>
    </div>
  );
}
