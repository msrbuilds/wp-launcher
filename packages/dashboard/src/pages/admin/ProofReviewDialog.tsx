import { useCallback, useEffect, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { useToast } from '../../components/Toast';

interface Proof {
  id: string;
  original_name: string;
  mime: string;
  size_bytes: number;
  amount: number | null;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
}

const utc = (ts: string) => new Date(`${ts.includes('T') ? ts : ts.replace(' ', 'T')}Z`);
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

const STATUS_VARIANT = {
  pending: 'default', accepted: 'secondary', rejected: 'destructive',
} as const;

/**
 * The staff side of a payment proof: look at what the client sent, then accept
 * it (the invoice becomes paid) or reject it with a reason they will read.
 */
export default function ProofReviewDialog({ invoiceId, invoiceNumber, open, onOpenChange, onReviewed }: {
  invoiceId: string;
  invoiceNumber: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onReviewed: () => void;
}) {
  const headers = useAdminHeaders();
  const toast = useToast();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/invoices/${invoiceId}/proofs`, { headers });
      if (!res.ok) throw new Error('load failed');
      setProofs(await res.json());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, headers]);

  useEffect(() => { if (open) { setLoading(true); load(); } }, [open, load]);

  async function review(proofId: string, action: 'accept' | 'reject', body?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/proofs/${proofId}/${action}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || 'That decision did not save');
        return;
      }
      setRejecting(null);
      setReason('');
      await load();
      onReviewed();
      toast.success(action === 'accept' ? 'Payment confirmed — the invoice is paid' : 'Rejected, and the client has been told');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment proof — {invoiceNumber}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </p>
        ) : loadFailed ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Could not load the submitted documents.</p>
            <Button variant="secondary" size="xs" onClick={() => { setLoading(true); load(); }}>Retry</Button>
          </div>
        ) : proofs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has been submitted for this invoice.</p>
        ) : (
          <div className="space-y-3">
            {proofs.map((proof) => (
              <div key={proof.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={`/api/projects/proofs/${proof.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{proof.original_name || 'Document'}</span>
                  </a>
                  <Badge variant={STATUS_VARIANT[proof.status]}>{proof.status}</Badge>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  Sent {utc(proof.created_at).toLocaleString()} · {kb(proof.size_bytes)}
                  {proof.amount != null && ` · client states ${Number(proof.amount).toFixed(2)}`}
                </p>
                {proof.note && <p className="mt-2 whitespace-pre-wrap text-sm">{proof.note}</p>}
                {proof.status === 'rejected' && proof.reject_reason && (
                  <p className="mt-2 text-sm text-destructive">Rejected: {proof.reject_reason}</p>
                )}

                {proof.status === 'pending' && (
                  rejecting === proof.id ? (
                    <div className="mt-3 space-y-2">
                      {/* The reason is required, and the client reads it
                          verbatim — so it is written here, not auto-generated. */}
                      <Textarea
                        rows={2}
                        autoFocus
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="What was wrong with it? The client sees this."
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="xs"
                          disabled={busy || !reason.trim()}
                          onClick={() => review(proof.id, 'reject', { reason })}
                        >
                          Send rejection
                        </Button>
                        <Button variant="secondary" size="xs" onClick={() => { setRejecting(null); setReason(''); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="xs" disabled={busy} onClick={() => review(proof.id, 'accept')}>
                        Accept — mark paid
                      </Button>
                      <Button variant="secondary" size="xs" disabled={busy} onClick={() => setRejecting(proof.id)}>
                        Reject
                      </Button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
