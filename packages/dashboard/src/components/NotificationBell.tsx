import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { apiFetch } from '../utils/api';

interface Notification {
  id: string;
  kind: string;
  subject: string;
  body: string;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

const REFRESH_MS = 60_000;

const utc = (ts: string) => new Date(`${ts.includes('T') ? ts : ts.replace(' ', 'T')}Z`);

/** "just now", "20m", "3h", "5d" — a full timestamp is more than a list needs. */
function ago(ts: string): string {
  const seconds = Math.max(0, (Date.now() - utc(ts).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return utc(ts).toLocaleDateString();
}

/**
 * The notification centre: everything that happened, whether or not an email
 * for it went out.
 *
 * The endpoint identifies the recipient from their own session, so the same
 * component serves staff and portal clients with no id passed in.
 */
export default function NotificationBell({ endpoint, extraHeaders }: {
  endpoint: string;
  extraHeaders?: Record<string, string>;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(endpoint, { headers: extraHeaders });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setUnread(data.unread || 0);
    } catch {
      // A background poll that failed is not worth interrupting anyone over;
      // the next tick tries again.
    } finally {
      setLoaded(true);
    }
    // extraHeaders is a fresh object each render in some callers; depending on
    // it would poll in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      // A background tab does not need a live badge, and polling one is work
      // nobody sees.
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Reopening should show what arrived while it was closed.
  useEffect(() => { if (open) load(); }, [open, load]);

  async function markRead(ids?: string[]) {
    setBusy(true);
    try {
      await apiFetch(`${endpoint}/read`, {
        method: 'POST',
        headers: { ...extraHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      await load();
    } catch {
      /* the next poll corrects the badge */
    } finally {
      setBusy(false);
    }
  }

  async function openItem(item: Notification) {
    setOpen(false);
    if (!item.read_at) await markRead([item.id]);
    if (item.link) navigate(item.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {/* Past 99 the exact number stops meaning anything and starts
                  breaking the badge's width. */}
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="xs" disabled={busy} onClick={() => markRead()}>
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {!loaded ? (
            <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      'w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted',
                      !item.read_at && 'bg-muted/50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn('text-sm', !item.read_at && 'font-medium')}>{item.subject}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{ago(item.created_at)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
