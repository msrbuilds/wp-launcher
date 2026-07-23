import { useState, useEffect, useCallback } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { User, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { apiFetch } from '../../utils/api';
import { useSettings } from '../../context/SettingsContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function UsersTab() {
  const headers = useAdminHeaders();
  const { smtpConfigured } = useSettings();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [banner, setBanner] = useState('');

  const fetchUsers = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/admin/users?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers })
      .then((r) => r.json())
      .then((data: PaginatedResponse<User>) => { setUsers(data.data || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function sendInvite(email: string, role: 'member' | 'admin', fromDialog: boolean) {
    if (fromDialog) { setInviting(true); setInviteError(''); }
    try {
      const res = await apiFetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation');
      setBanner(data.message);
      if (fromDialog) {
        setInviteOpen(false);
        setInviteEmail('');
        setInviteRole('member');
      }
      fetchUsers();
    } catch (err: any) {
      if (fromDialog) setInviteError(err.message);
      else setBanner(err.message);
    } finally {
      if (fromDialog) setInviting(false);
    }
  }

  async function withdrawInvite(id: string) {
    if (!confirm('Withdraw this invitation?')) return;
    const res = await apiFetch(`/api/admin/users/invite/${id}`, { method: 'DELETE', headers });
    if (res.ok) setBanner('Invitation withdrawn');
    fetchUsers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE', headers });
    fetchUsers();
  }

  async function handleRoleChange(id: string, newRole: 'admin' | 'user') {
    const action = newRole === 'admin' ? 'promote to admin' : 'demote to user';
    if (!confirm(`Are you sure you want to ${action}?`)) return;

    setRoleUpdating(id);
    try {
      const res = await apiFetch(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to update role');
      } else {
        fetchUsers();
      }
    } catch {
      alert('Failed to update role');
    } finally {
      setRoleUpdating(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (loading && users.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!smtpConfigured && (
        <Alert>
          <AlertDescription>
            Email delivery isn't configured, so invitations can't be sent. Set the SMTP options in your
            environment first.
          </AlertDescription>
        </Alert>
      )}

      {banner && (
        <Alert>
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Users ({total})</h3>
          <Button size="sm" onClick={() => { setInviteError(''); setInviteOpen(true); }}>
            <UserPlus className="h-4 w-4" />
            Invite user
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isSystem = u.id === 'admin' || u.id === 'local-user';
              const pending = !u.verified;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    {u.email}
                    {isSystem && <span className="ml-2 text-xs text-muted-foreground">(system)</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' || u.role === 'owner' ? 'default' : 'secondary'}>
                      {u.role || 'member'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={pending ? 'outline' : 'secondary'}>
                      {pending ? 'Invite pending' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(u.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isSystem && pending && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendInvite(u.email, (u.role === 'admin' ? 'admin' : 'member'), false)}
                          >
                            Resend
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => withdrawInvite(u.id)}>
                            Withdraw
                          </Button>
                        </>
                      )}
                      {!isSystem && !pending && (
                        <>
                          {u.role === 'admin' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRoleChange(u.id, 'user')}
                              disabled={roleUpdating === u.id}
                            >
                              {roleUpdating === u.id ? '...' : 'Demote'}
                            </Button>
                          ) : u.role !== 'owner' ? (
                            <Button
                              size="sm"
                              onClick={() => handleRoleChange(u.id, 'admin')}
                              disabled={roleUpdating === u.id}
                            >
                              {roleUpdating === u.id ? '...' : 'Promote'}
                            </Button>
                          ) : null}
                          {u.role !== 'owner' && (
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(u.id)}>
                              Delete
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              They'll get an email with a link to set a password and join this panel.
            </DialogDescription>
          </DialogHeader>

          <form
            id="invite-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); sendInvite(inviteEmail.trim(), inviteRole, true); }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'member' | 'admin')}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member — manages their own sites</SelectItem>
                  <SelectItem value="admin">Admin — full panel access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="submit" form="invite-form" disabled={inviting || !inviteEmail.trim()}>
              {inviting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : 'Send invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
