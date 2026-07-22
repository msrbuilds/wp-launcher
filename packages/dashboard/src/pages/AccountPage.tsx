import { useRef, useState } from 'react';
import { Loader2, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

type Note = { kind: 'ok' | 'error'; text: string } | null;

function NoteLine({ note }: { note: Note }) {
  if (!note) return null;
  return (
    <p className={note.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'}>
      {note.text}
    </p>
  );
}

export default function AccountPage() {
  const { user, logout, refreshUser } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Account settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, sign-in email, and password.
        </p>
      </div>

      <ProfileCard
        name={user?.name ?? ''}
        email={user?.email ?? ''}
        avatarUrl={user?.avatarUrl ?? ''}
        onChanged={refreshUser}
      />
      <EmailCard
        email={user?.email ?? ''}
        pendingEmail={user?.pendingEmail ?? ''}
        onChanged={refreshUser}
      />
      <PasswordCard />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Sign out</div>
            <div className="text-sm text-muted-foreground">End your session on this device.</div>
          </div>
          <Button variant="outline" onClick={logout}>Log out</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileCard({
  name: initialName, email, avatarUrl, onChanged,
}: { name: string; email: string; avatarUrl: string; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNote(null);
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      await onChanged();
      setNote({ kind: 'ok', text: 'Profile updated' });
    } catch (err: any) {
      setNote({ kind: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNote({ kind: 'error', text: 'Image too large (max 2MB)' });
      return;
    }
    setUploading(true);
    setNote(null);
    try {
      const res = await apiFetch('/api/auth/avatar', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      await onChanged();
      setNote({ kind: 'ok', text: 'Avatar updated' });
    } catch (err: any) {
      setNote({ kind: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    setNote(null);
    try {
      const res = await apiFetch('/api/auth/avatar', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove avatar');
      await onChanged();
      setNote({ kind: 'ok', text: 'Avatar removed' });
    } catch (err: any) {
      setNote({ kind: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your name and avatar appear across the panel.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={name} email={email} src={avatarUrl || null} size="xl" />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</>
                  : <><Upload className="h-4 w-4" /> Upload</>}
              </Button>
              {avatarUrl && (
                <Button size="sm" variant="outline" onClick={removeAvatar} disabled={uploading}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">PNG, JPG, WebP, or GIF. Max 2MB.</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={uploadAvatar}
              className="hidden"
            />
          </div>
        </div>

        <form onSubmit={saveName} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
              className="max-w-md"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save profile'}
            </Button>
            <NoteLine note={note} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailCard({
  email, pendingEmail, onChanged,
}: { email: string; pendingEmail: string; onChanged: () => Promise<void> }) {
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNote(null);
    try {
      const res = await apiFetch('/api/auth/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail, currentPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start email change');
      setNewEmail('');
      setCurrentPassword('');
      await onChanged();
      setNote({ kind: 'ok', text: data.message });
    } catch (err: any) {
      setNote({ kind: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email address</CardTitle>
        <CardDescription>
          This is the address you sign in with. Changing it needs confirmation from the new inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="text-sm">
          <span className="text-muted-foreground">Current: </span>
          <span className="font-medium text-foreground">{email}</span>
        </div>

        {pendingEmail && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Pending change to <span className="font-medium text-foreground">{pendingEmail}</span> —
            check that inbox for the confirmation link.
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="newEmail">New email</Label>
            <Input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="max-w-md"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="emailPassword">Current password</Label>
            <Input
              id="emailPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="max-w-md"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Send confirmation'}
            </Button>
            <NoteLine note={note} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNote(null);
    try {
      const res = await apiFetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      setCurrentPassword('');
      setNewPassword('');
      setNote({ kind: 'ok', text: 'Password updated' });
    } catch (err: any) {
      setNote({ kind: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Use at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="max-w-md"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="max-w-md"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : 'Update password'}
            </Button>
            <NoteLine note={note} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
