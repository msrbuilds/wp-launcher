import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { apiFetch } from '../../utils/api';

type Zone = 'utc' | 'local';

// Local offset as a "UTC±HH:MM" label. getTimezoneOffset returns minutes behind
// UTC (positive when behind), so negate it for the conventional sign.
function localOffsetLabel(): string {
  const offMin = -new Date().getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

function formatTime(date: Date, zone: Zone): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(zone === 'utc' ? { timeZone: 'UTC' } : {}),
  }).format(date);
}

/**
 * Live clock showing the server's time. We sync once against /health (whose
 * timestamp is the server clock in UTC), keep the offset from the browser
 * clock, then tick locally — re-syncing periodically to correct drift. The
 * UTC/local toggle only changes how that same instant is displayed.
 */
export function ServerClock() {
  const [now, setNow] = useState(() => new Date());
  const [zone, setZone] = useState<Zone>('utc');
  const offsetRef = useRef(0); // serverTime - browserTime, in ms

  useEffect(() => {
    let active = true;

    async function sync() {
      try {
        const res = await apiFetch('/health');
        if (!res.ok) return;
        const { timestamp } = await res.json();
        const server = Date.parse(timestamp);
        if (active && !Number.isNaN(server)) offsetRef.current = server - Date.now();
      } catch {
        // Fall back to the browser clock (offset stays 0).
      }
    }

    sync();
    const tick = setInterval(() => setNow(new Date(Date.now() + offsetRef.current)), 1000);
    const resync = setInterval(sync, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(tick);
      clearInterval(resync);
    };
  }, []);

  const localLabel = localOffsetLabel();

  const segment = (z: Zone) =>
    cn(
      'px-2 py-1 transition-colors',
      zone === z ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <div className="hidden h-9 items-center gap-2 rounded-md border border-border-interactive px-3 text-xs md:flex">
      <span className="text-muted-foreground">Server Time:</span>
      <span className="font-mono font-medium tabular-nums text-foreground">
        {formatTime(now, zone)}
      </span>
      <span className="flex overflow-hidden rounded-sm border border-border-interactive" role="group" aria-label="Time zone">
        <button type="button" onClick={() => setZone('utc')} aria-pressed={zone === 'utc'} className={segment('utc')}>
          UTC
        </button>
        <button
          type="button"
          onClick={() => setZone('local')}
          aria-pressed={zone === 'local'}
          title="Your local time zone"
          className={cn('border-l border-border-interactive', segment('local'))}
        >
          {localLabel}
        </button>
      </span>
    </div>
  );
}
