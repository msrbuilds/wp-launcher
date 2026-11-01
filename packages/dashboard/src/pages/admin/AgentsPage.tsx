import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { apiFetch } from '../../utils/api';
import { formatWhen, type Grant } from '../account/ConnectedAppsCard';

/** Settings → AI agents: how to connect, and (owner only) every user's connected apps. */
export default function AgentsPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const isOwner = user?.role === 'owner';
  const [info, setInfo] = useState<{ mcpUrl: string; isPublic: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [grants, setGrants] = useState<Grant[] | null>(null);

  useEffect(() => {
    apiFetch('/api/oauth/info').then((r) => r.json()).then(setInfo).catch(() => setInfo(null));
  }, []);

  const loadGrants = useCallback(() => {
    if (!isOwner) return;
    apiFetch('/api/oauth/grants/all').then((r) => r.json()).then((d) => setGrants(d.grants ?? [])).catch(() => setGrants([]));
  }, [isOwner]);
  useEffect(loadGrants, [loadGrants]);

  async function copy() {
    if (!info) return;
    await navigator.clipboard.writeText(info.mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function revoke(g: Grant) {
    if (!(await confirm({ title: `Disconnect ${g.clientName} for ${g.userEmail ?? 'this user'}?`, confirmText: 'Disconnect', variant: 'destructive' }))) return;
    await apiFetch(`/api/oauth/grants/${g.id}`, { method: 'DELETE' });
    loadGrants();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">AI agents (MCP)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Let Claude, ChatGPT and other MCP clients manage your sites and Mini CRM. Each person approves their own agent, with only the permissions they choose.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MCP server URL</CardTitle>
          <CardDescription>Paste this into your AI agent. It will open this panel so you can sign in and approve access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!info ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 text-sm">{info.mcpUrl}</code>
              <Button variant="outline" size="icon" onClick={copy} aria-label="Copy MCP URL">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          )}
          {info && !info.isPublic && (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Only local agents can reach this install</AlertTitle>
              <AlertDescription>
                This panel is not on a public HTTPS address, so cloud-hosted agents (Claude.ai, ChatGPT) cannot connect. Claude Code on this machine can.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect an agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="font-medium text-foreground">Claude.ai or Claude Desktop</div>
            <p className="text-muted-foreground">Settings → Connectors → Add custom connector, paste the URL above, then approve in the window that opens.</p>
          </div>
          <div>
            <div className="font-medium text-foreground">Claude Code</div>
            <code className="mt-1 block break-all rounded-md border border-border bg-muted px-3 py-2 text-xs">claude mcp add --transport http wp-launcher {info?.mcpUrl ?? '<url>'}</code>
          </div>
          <div>
            <div className="font-medium text-foreground">ChatGPT</div>
            <p className="text-muted-foreground">Settings → Connectors → add a custom connector with the URL above.</p>
          </div>
          <p className="text-xs text-muted-foreground">Your own connected apps and their activity are on your Account page.</p>
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>All connected apps</CardTitle>
            <CardDescription>Every staff user’s agents. You can disconnect any of them; their activity stays private to them.</CardDescription>
          </CardHeader>
          <CardContent>
            {grants === null && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {grants?.length === 0 && <p className="text-sm text-muted-foreground">No AI agents are connected.</p>}
            <ul className="divide-y divide-border">
              {grants?.map((g) => (
                <li key={g.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground" title={g.clientName}>{g.clientName}</div>
                    <div className="text-xs text-muted-foreground">{g.userEmail} · {g.redirectHost} · last used {formatWhen(g.lastUsedAt)}</div>
                    <div className="mt-1 flex flex-wrap gap-1">{g.scopes.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => revoke(g)}>Revoke</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
