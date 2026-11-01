import { useCallback, useEffect, useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { apiFetch } from '../../utils/api';

export interface Grant {
  id: string;
  clientName: string;
  redirectHost: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  userEmail?: string | null;
}

// DB timestamps are UTC without a `Z`; append it before parsing.
export const formatWhen = (ts: string | null) => (ts ? new Date(`${ts}Z`).toLocaleString() : 'Never');

/**
 * The AI agents this user has authorised, with per-app and Revoke all. Revoking
 * stops the agent on its very next call.
 */
export default function ConnectedAppsCard() {
  const confirm = useConfirm();
  const toast = useToast();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch('/api/oauth/grants').then((r) => r.json()).then((d) => setGrants(d.grants ?? [])).catch(() => setGrants([]));
  }, []);
  useEffect(load, [load]);

  async function revoke(grant: Grant) {
    if (!(await confirm({ title: `Disconnect ${grant.clientName}?`, description: 'It loses access immediately and would need your approval to reconnect.', confirmText: 'Disconnect', variant: 'destructive' }))) return;
    setBusy(grant.id);
    const res = await apiFetch(`/api/oauth/grants/${grant.id}`, { method: 'DELETE' });
    setBusy(null);
    if (res.ok) toast.success(`${grant.clientName} disconnected`);
    else toast.error('Could not disconnect that app');
    load();
  }

  async function revokeAll() {
    if (!(await confirm({ title: 'Disconnect every AI agent?', description: 'All of your connected apps lose access immediately, including any approval still in progress.', confirmText: 'Disconnect all', variant: 'destructive' }))) return;
    setBusy('all');
    const res = await apiFetch('/api/oauth/grants/revoke-all', { method: 'POST' });
    setBusy(null);
    if (res.ok) toast.success('All AI agents disconnected');
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Connected AI agents</CardTitle>
          <CardDescription>Apps you allowed to manage your sites and Mini CRM through MCP.</CardDescription>
        </div>
        {!!grants?.length && (
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={revokeAll}>Revoke all</Button>
        )}
      </CardHeader>
      <CardContent>
        {grants === null && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {grants?.length === 0 && <p className="text-sm text-muted-foreground">No AI agents are connected.</p>}
        <ul className="divide-y divide-border">
          {grants?.map((g) => (
            <li key={g.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground" title={g.clientName}>{g.clientName}</div>
                  <div className="break-all text-xs text-muted-foreground">{g.redirectHost ?? 'unknown host'}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {g.scopes.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Authorised {formatWhen(g.createdAt)} · Last used {formatWhen(g.lastUsedAt)}</div>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => revoke(g)}>
                {busy === g.id && <Loader2 className="size-4 animate-spin" />}
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
