import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '../utils/api';

type Mode = 'immediate' | 'daily' | 'off';

const OPTIONS: { mode: Mode; label: string; hint: string }[] = [
  { mode: 'immediate', label: 'As it happens', hint: 'One email per update' },
  { mode: 'daily', label: 'Daily digest', hint: 'One email each morning' },
  { mode: 'off', label: 'Never', hint: 'No email at all' },
];

/**
 * How this recipient wants to hear about Mini CRM events.
 *
 * The endpoint identifies the recipient from their own session, so the same
 * control serves staff and portal clients with no id passed in.
 */
export default function NotificationPrefControl({ endpoint, extraHeaders }: {
  endpoint: string;
  extraHeaders?: Record<string, string>;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(endpoint, { headers: extraHeaders });
      if (!res.ok) throw new Error('load failed');
      setMode((await res.json()).mode);
      setError('');
    } catch {
      setError('Could not read your email preference.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  async function choose(next: Mode) {
    if (next === mode) return;
    const previous = mode;
    setMode(next);
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(endpoint, {
        method: 'PUT',
        headers: { ...extraHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (!res.ok) throw new Error('save failed');
      // The server decides: an unrecognised mode comes back as immediate, and
      // the buttons must show what was actually stored.
      setMode((await res.json()).mode);
    } catch {
      setMode(previous);
      setError('That preference did not save.');
    } finally {
      setSaving(false);
    }
  }

  if (mode === null) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
    </p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <Button
            key={option.mode}
            type="button"
            size="xs"
            variant={mode === option.mode ? 'default' : 'secondary'}
            disabled={saving}
            onClick={() => choose(option.mode)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {OPTIONS.find((o) => o.mode === mode)?.hint}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
