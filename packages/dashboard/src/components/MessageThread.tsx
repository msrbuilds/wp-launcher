import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, FolderKanban, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiFetch } from '../utils/api';

export interface ThreadMessage {
  id: string;
  author_type: 'staff' | 'client';
  author_label: string;
  body: string;
  project_id: string | null;
  project_name: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  created_at: string;
}

const utc = (ts: string) => new Date(`${ts.includes('T') ? ts : ts.replace(' ', 'T')}Z`);

/**
 * One client conversation, rendered the same way for both sides.
 *
 * `side` says which messages are "mine" — the endpoint decides everything
 * else, so the panel and the portal share this component without either
 * knowing about the other's routes.
 */
export default function MessageThread({
  endpoint, side, extraHeaders, preset, presetLabel, emptyText, className,
}: {
  endpoint: string;
  side: 'staff' | 'client';
  extraHeaders?: Record<string, string>;
  /** A reference to offer alongside the composer, e.g. the project in view. */
  preset?: { projectId?: string; invoiceId?: string };
  presetLabel?: string;
  emptyText?: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [body, setBody] = useState('');
  const [attachRef, setAttachRef] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(endpoint, { headers: extraHeaders });
      if (!res.ok) throw new Error('load failed');
      setMessages(await res.json());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
    // extraHeaders is a fresh object each render in some callers; depending on
    // it would reload the thread forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { ...extraHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          ...(attachRef && preset ? preset : {}),
        }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || 'That message did not send');
        return;
      }
      // Only cleared once it is actually sent — a failed send must not eat
      // what someone just wrote.
      setBody('');
      await load();
    } catch {
      setError('That message did not send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </p>
        ) : loadFailed ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Could not load the conversation.</p>
            <Button variant="secondary" size="xs" onClick={() => { setLoading(true); load(); }}>Retry</Button>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText || 'No messages yet.'}</p>
        ) : messages.map((message) => {
          const mine = message.author_type === side;
          return (
            <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-xl px-3 py-2',
                mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              )}>
                <p className={cn('text-xs', mine ? 'opacity-80' : 'text-muted-foreground')}>
                  {message.author_label} · {utc(message.created_at).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
                {(message.project_name || message.invoice_number) && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {message.project_name && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 opacity-80">
                        <FolderKanban className="h-3 w-3" /> {message.project_name}
                      </span>
                    )}
                    {message.invoice_number && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 opacity-80">
                        <Receipt className="h-3 w-3" /> {message.invoice_number}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="space-y-2">
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message..."
        />
        {preset && presetLabel && (
          <div className="flex items-center gap-2">
            <Checkbox id="thread-ref" checked={attachRef} onCheckedChange={(v) => setAttachRef(v === true)} />
            <Label htmlFor="thread-ref" className="text-xs font-normal text-muted-foreground">
              {presetLabel}
            </Label>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={sending || !body.trim()}>
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending</> : 'Send'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => load()} disabled={sending}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </form>
    </div>
  );
}
