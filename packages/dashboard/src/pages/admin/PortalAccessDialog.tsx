import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';

interface PortalUser {
  id: string;
  email: string;
  verified: number;
  last_login_at: string | null;
}

/** DB timestamps are UTC without a Z; without it the browser reads them local. */
const utc = (ts: string) => new Date(`${ts.includes('T') ? ts : ts.replace(' ', 'T')}Z`);

export default function PortalAccessDialog({
  clientId, clientName, open, onOpenChange,
}: { clientId: string; clientName: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const headers = useAdminHeaders();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // A failed load must not fall through to the empty state: "nobody has access
  // yet" would read as an answer when we never got one.
  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/clients/${clientId}/portal-users`, { headers });
      if (!res.ok) throw new Error('load failed');
      setUsers(await res.json());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [clientId, headers]);

  useEffect(() => { if (open) { setLoading(true); load(); } }, [open, load]);

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/clients/${clientId}/portal-users`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || 'Could not send that invitation');
        return;
      }
      setEmail('');
      await load();
      toast.success('Invitation sent');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(user: PortalUser) {
    const ok = await confirm({
      title: `Remove ${user.email}?`,
      description: 'They lose access to the portal immediately and their password stops working.',
      confirmText: 'Remove',
    });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/portal-users/${user.id}`, { method: 'DELETE', headers });
    if (res.ok) { await load(); toast.success('Portal access removed'); }
    else toast.error((await res.json().catch(() => ({}))).error || 'Could not remove that login');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Portal access — {clientName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="portal-invite">Invite by email</Label>
          <div className="flex gap-2">
            <Input id="portal-invite" type="email" placeholder="name@client.com" value={email}
                   onChange={(e) => setEmail(e.target.value)} />
            <Button onClick={invite} disabled={busy || !email.trim()}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending</> : 'Invite'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            They get a link to set a password. It works once and expires after 72 hours.
          </p>
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : loadFailed ? (
            <div className="flex items-center gap-2 rounded-lg border border-border p-3">
              <p className="text-sm text-muted-foreground">Could not load who has access.</p>
              <Button variant="secondary" size="xs" onClick={() => { setLoading(true); load(); }}>Retry</Button>
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody from this client has portal access yet.</p>
          ) : users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.email}</p>
                {/* An operator needs to know whether the person ever got in,
                    not merely that an invitation was sent. */}
                <p className="text-xs text-muted-foreground">
                  {user.verified
                    ? user.last_login_at
                      ? `Last signed in ${utc(user.last_login_at).toLocaleDateString()}`
                      : 'Password set, not signed in yet'
                    : 'Invited — has not set a password'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={user.verified ? 'secondary' : 'outline'}>
                  {user.verified ? 'Active' : 'Invited'}
                </Badge>
                <Button variant="destructive" size="xs" onClick={() => revoke(user)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
