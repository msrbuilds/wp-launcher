import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Bot, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { canApprove, consentView, initialSelection, renderableLogo, toggleScope, type ConsentResponse } from '../lib/oauth-consent';

/**
 * OAuth consent for MCP agents. Outside AppShell, like /login. The query string
 * is the client's authorisation request; it is sent back verbatim with the
 * decision, which the API re-validates before issuing a code.
 */
export default function OAuthAuthorizePage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [response, setResponse] = useState<ConsentResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    apiFetch(`/api/oauth/authorize/request${location.search}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 404) setResponse({ render: 'AI agent access is not enabled on this panel.' });
        else if (!res.ok && !data.render && !data.redirect) setResponse({ render: data.error || 'This request could not be processed.' });
        else {
          setResponse(data);
          if (data.requestedScopes) setSelected(initialSelection(data.requestedScopes, data.offerableScopes));
        }
      })
      .catch(() => setResponse({ render: 'Could not reach the panel. Try again.' }));
  }, [isAuthenticated, location.search]);

  const view = authLoading
    ? { kind: 'loading' as const }
    : consentView({ signedIn: isAuthenticated, role: user?.role, response, path: location.pathname + location.search });

  useEffect(() => {
    if (view.kind === 'login') navigate(view.to, { replace: true });
  }, [view.kind, view.kind === 'login' ? view.to : '']); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(approve: boolean) {
    setSubmitting(true);
    setError('');
    try {
      const params = Object.fromEntries(new URLSearchParams(location.search));
      const res = await apiFetch('/api/oauth/authorize/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, approve, scopes: approve ? selected : [] }),
      });
      const data = await res.json();
      if (data.redirectTo) window.location.assign(data.redirectTo);
      else throw new Error(data.render || data.error || 'The decision could not be recorded.');
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6">
        {(view.kind === 'loading' || view.kind === 'login') && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        )}

        {view.kind === 'forbidden' && (
          <Alert>
            <ShieldAlert />
            <AlertTitle>Not available</AlertTitle>
            <AlertDescription>MCP access is available to panel administrators only.</AlertDescription>
          </Alert>
        )}

        {view.kind === 'error' && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>This connection can’t continue</AlertTitle>
            <AlertDescription className="break-words">{view.message}</AlertDescription>
          </Alert>
        )}

        {view.kind === 'return' && (
          <>
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>This connection can’t continue</AlertTitle>
              <AlertDescription>The app’s request was not valid. You can go back to it to see the details.</AlertDescription>
            </Alert>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => window.location.assign(view.to)}>
                Return to <span className="break-all font-mono">{view.host}</span>
              </Button>
            </div>
          </>
        )}

        {view.kind === 'consent' && (
          <>
            <div className="mb-5 flex items-start gap-3">
              {renderableLogo(view.request.client.logoUri, window.location.origin) ? (
                <img src={view.request.client.logoUri!} alt="" className="size-10 shrink-0 rounded-md border border-border object-contain" />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                  <Bot className="size-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-card-foreground" title={view.request.client.name}>{view.request.client.name}</h2>
                  <Badge variant="secondary">Unverified</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  wants to act as you on <span className="break-all font-medium text-foreground">{view.request.instance.url}</span>
                </p>
              </div>
            </div>

            <div className="mb-5 rounded-md border border-border bg-muted/50 p-3 text-sm">
              <p className="text-muted-foreground">After you decide, you’ll be sent to</p>
              <p className="break-all font-mono font-medium text-foreground">{view.request.client.redirectHost}</p>
              <p className="mt-1 text-xs text-muted-foreground">The app’s name is chosen by the app itself. Only continue if you started this connection and recognise this address.</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium text-card-foreground">Allow this app to:</legend>
              {view.request.offerableScopes.map((scope) => {
                const info = view.request.scopeInfo[scope];
                return (
                  <label key={scope} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-accent/50">
                    <Checkbox checked={selected.includes(scope)} onCheckedChange={() => setSelected((s) => toggleScope(s, scope))} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                        {info?.label ?? scope}
                        {info?.destructive && <Badge variant="destructive">Can delete or send</Badge>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{info?.description}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" disabled={submitting} onClick={() => decide(false)}>Deny</Button>
              <Button disabled={submitting || !canApprove(selected)} onClick={() => decide(true)}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Approve
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
