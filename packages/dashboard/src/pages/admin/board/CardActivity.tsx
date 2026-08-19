import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAdminHeaders } from '../AdminLayout';
import { apiFetch } from '../../../utils/api';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';

interface Comment {
  id: string; author_label: string; body: string; created_at: string;
}
interface Attachment {
  id: string; original_name: string; mime: string; size_bytes: number; created_at: string;
}

const utc = (ts: string) => new Date(`${ts.includes('T') ? ts : ts.replace(' ', 'T')}Z`);
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * The internal record on a card: notes and files, staff-only.
 *
 * Clients never see or write here — they raise things in their own thread —
 * so this can stay frank, and nothing a client says gets stranded on a card
 * or in a column later hidden.
 */
export default function CardActivity({ cardId, onChanged }: { cardId: string; onChanged?: () => void }) {
  const headers = useAdminHeaders();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [commentRes, attachmentRes] = await Promise.all([
        apiFetch(`/api/projects/board/cards/${cardId}/comments`, { headers }),
        apiFetch(`/api/projects/board/cards/${cardId}/attachments`, { headers }),
      ]);
      if (!commentRes.ok || !attachmentRes.ok) throw new Error('load failed');
      setComments(await commentRes.json());
      setAttachments(await attachmentRes.json());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
    // headers is rebuilt each render in the caller; depending on it loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/board/cards/${cardId}/comments`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || 'That comment did not save');
        return;
      }
      setBody('');
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(comment: Comment) {
    const ok = await confirm({
      title: 'Delete this comment?',
      description: comment.body.slice(0, 140),
      confirmText: 'Delete',
    });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/board/comments/${comment.id}`, { method: 'DELETE', headers });
    if (!res.ok) { toast.error('Could not delete that comment'); return; }
    await load();
    onChanged?.();
  }

  async function uploadFile(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch(`/api/projects/board/cards/${cardId}/attachments`, {
        method: 'POST', headers, body: form,
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || 'That file was not accepted');
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
      // Cleared either way, so choosing the same file again still fires change.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeAttachment(attachment: Attachment) {
    const ok = await confirm({
      title: `Delete ${attachment.original_name || 'this file'}?`,
      description: 'The file is removed from disk as well.',
      confirmText: 'Delete',
    });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/board/attachments/${attachment.id}`, { method: 'DELETE', headers });
    if (!res.ok) { toast.error('Could not delete that file'); return; }
    await load();
    onChanged?.();
  }

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
    </p>;
  }

  if (loadFailed) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">Could not load this card's notes and files.</p>
        <Button variant="secondary" size="xs" onClick={() => { setLoading(true); load(); }}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Files ({attachments.length})</h4>
          <div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadFile(file); }}
            />
            <Button type="button" variant="secondary" size="xs" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3 w-3" /> Attach
            </Button>
          </div>
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or PDF, up to 5 MB.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <a
                  href={`/api/projects/board/attachments/${attachment.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{attachment.original_name || 'File'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{kb(attachment.size_bytes)}</span>
                </a>
                <Button variant="ghost" size="xs" onClick={() => removeAttachment(attachment)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Notes ({comments.length})</h4>
        {comments.length > 0 && (
          <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-lg bg-muted px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {comment.author_label} · {utc(comment.created_at).toLocaleString()}
                  </p>
                  <Button variant="ghost" size="xs" onClick={() => removeComment(comment)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addComment} className="space-y-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
                    placeholder="Internal note — the client never sees this." />
          <Button type="submit" size="xs" disabled={busy || !body.trim()}>
            {busy ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving</> : 'Add note'}
          </Button>
        </form>
      </div>
    </div>
  );
}
