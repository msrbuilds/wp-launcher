import { useState, useEffect, useCallback } from 'react';
import { Loader2, UserPlus, ShieldCheck } from 'lucide-react';
import { User, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { apiFetch } from '../../utils/api';
import { useSettings } from '../../context/SettingsContext';
import { useConfirm } from '../../components/ConfirmDialog';
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
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // Role dialog — role changes go through an explicit picker, never a one-click
  // promote straight to admin.
  const [roleUser, setRoleUser] = useState<User | null>(null);
  const [roleChoice, setRoleChoice] = useState<'member' | 'admin'>('member');
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState('');

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

  async function withdrawInvite(user: User) {
    if (!(await confirm({
      title: 'Withdraw invitation?',
      description: <>The pending invite for <strong>{user.email}</strong> will be cancelled and its link stops working.</>,
      confirmText: 'Withdraw',
      variant: 'destructive',
    }))) return;
    const res = await apiFetch(`/api/admin/users/invite/${user.id}`, { method: 'DELETE', headers });
    if (res.ok) setBanner('Invitation withdrawn');
    fetchUsers();
  }

  async function handleDelete(user: User) {
    if (!(await confirm({
      title: 'Delete user?',
      description: <>This permanently removes <strong>{user.email}</strong> and their access. This cannot be undone.</>,
      confirmText: 'Delete user',
      variant: 'destructive',
    }))) return;
    await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers });
    fetchUsers();
  }

  function openRoleDialog(user: User) {
    setRoleUser(user);
    setRoleChoice(user.role === 'admin' ? 'admin' : 'member');
    setRoleError('');
  }

  async function saveRole() {
    if (!roleUser) return;
    // API roles: 'admin' or the legacy 'user' (== member).
    const apiRole = roleChoice === 'admin' ? 'admin' : 'user';
    setRoleSaving(true);
    setRoleError('');
    try {
      const res = await apiFetch(`/api/admin/users/${roleUser.id}/role`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: apiRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }
      setBanner(`${roleUser.email} is now ${roleChoice === 'admin' ? 'an admin' : 'a member'}`);
      setRoleUser(null);
      fetchUsers();
    } catch (err: any) {
      setRoleError(err.message);
    } finally {
      setRoleSaving(false);
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
                          <Button variant="destructive" size="sm" onClick={() => withdrawInvite(u)}>
                            Withdraw
                          </Button>
                        </>
                      )}
                      {!isSystem && !pending && u.role !== 'owner' && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openRoleDialog(u)}>
                            <ShieldCheck className="h-4 w-4" /> Change role
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(u)}>
                            Delete
                          </Button>
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

      <Dialog open={!!roleUser} onOpenChange={(o) => { if (!o) setRoleUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Set the panel role for <strong className="text-foreground">{roleUser?.email}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Label htmlFor="role-select">Role</Label>
            <Select value={roleChoice} onValueChange={(v) => setRoleChoice(v as 'member' | 'admin')}>
              <SelectTrigger id="role-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member — manages only their own sites</SelectItem>
                <SelectItem value="admin">Admin — full access to the panel and every site</SelectItem>
              </SelectContent>
            </Select>
            {roleChoice === 'admin' && (
              <p className="text-xs text-muted-foreground">
                Admins can manage users, blueprints, settings, and all sites. Grant this only to people you trust.
              </p>
            )}
            {roleError && <p className="text-sm text-destructive">{roleError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleUser(null)}>Cancel</Button>
            <Button
              onClick={saveRole}
              disabled={roleSaving || (roleUser?.role === 'admin' ? 'admin' : 'member') === roleChoice}
            >
              {roleSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
