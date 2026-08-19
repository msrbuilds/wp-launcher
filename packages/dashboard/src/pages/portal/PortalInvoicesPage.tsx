import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '../../utils/api';

interface InvoiceSummary {
  id: string; invoice_number: string; total: number; currency: string;
  status: string; issue_date: string; due_date: string | null;
}
interface LineItem { description: string; qty: number; rate: number; amount: number }
interface PaymentMethod { id: string; label: string; instructions: string }
interface Proof {
  id: string; original_name: string; mime: string; size_bytes: number;
  amount: number | null; note: string | null;
  status: 'pending' | 'accepted' | 'rejected'; reject_reason: string | null; created_at: string;
}

const utc = (ts: string) => new Date(`${ts.includes('T') ? ts : ts.replace(' ', 'T')}Z`);

/**
 * Internal status names are for the operator. A client reading
 * "awaiting_verification" learns nothing about what is happening to them.
 */
const STATUS_LABEL: Record<string, string> = {
  sent: 'Awaiting payment',
  overdue: 'Overdue',
  awaiting_verification: 'Checking your payment',
  paid: 'Paid',
};
const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/** Statuses on which sending a payment document still makes sense. */
const CAN_UPLOAD = new Set(['sent', 'overdue', 'awaiting_verification']);

const PROOF_ICON = { pending: Clock, accepted: CheckCircle2, rejected: XCircle } as const;
const PROOF_TEXT = { pending: 'Being checked', accepted: 'Confirmed', rejected: 'Not accepted' } as const;

function ProofSection({ invoiceId, invoiceStatus, proofs, onUploaded }: {
  invoiceId: string; invoiceStatus: string; proofs: Proof[]; onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Choose the receipt or screenshot first.'); return; }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (amount.trim()) form.append('amount', amount.trim());
      if (note.trim()) form.append('note', note.trim());
      const res = await apiFetch(`/api/portal/invoices/${invoiceId}/proofs`, { method: 'POST', body: form });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || 'That upload did not go through.');
        return;
      }
      // Cleared only on success, so a rejected file is still selected when the
      // client corrects the problem and tries again.
      if (fileRef.current) fileRef.current.value = '';
      setAmount('');
      setNote('');
      onUploaded();
    } catch {
      setError('That upload did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h2 className="mb-1 text-base font-semibold">Proof of payment</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Send a receipt or screenshot and we will confirm it. PNG, JPEG, WebP or PDF, up to 5 MB.
      </p>

      {proofs.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {proofs.map((proof) => {
            const Icon = PROOF_ICON[proof.status];
            return (
              <li key={proof.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={`/api/portal/proofs/${proof.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{proof.original_name || 'Document'}</span>
                  </a>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className="h-3 w-3" /> {PROOF_TEXT[proof.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sent {utc(proof.created_at).toLocaleDateString()}
                  {proof.amount != null && ` · stated ${Number(proof.amount).toFixed(2)}`}
                </p>
                {proof.status === 'rejected' && proof.reject_reason && (
                  <p className="mt-1 text-xs text-destructive">{proof.reject_reason}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {CAN_UPLOAD.has(invoiceStatus) ? (
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="proof-file">Receipt or screenshot</Label>
            <Input id="proof-file" ref={fileRef} type="file"
                   accept="image/png,image/jpeg,image/webp,application/pdf" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="proof-amount">Amount paid (optional)</Label>
            <Input id="proof-amount" type="number" step="0.01" min="0" value={amount}
                   onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="proof-note">Note (optional)</Label>
            <Textarea id="proof-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Reference number, which account it came from..." />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending</> : 'Send proof'}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">This invoice is settled — nothing more to send.</p>
      )}
    </div>
  );
}

function InvoiceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [invoice, setInvoice] = useState<Record<string, any> | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/portal/invoices/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setInvoice(data.invoice);
    setMethods(data.paymentMethods || []);
    setProofs(data.proofs || []);
  }, [id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
    </p>;
  }
  if (!invoice) return <p className="text-sm text-muted-foreground">That invoice is not available.</p>;

  const items: LineItem[] = Array.isArray(invoice.items) ? invoice.items : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{invoice.invoice_number}</h1>
        <Button variant="secondary" size="sm" onClick={onBack}>Back to invoices</Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Badge variant="secondary">{statusLabel(String(invoice.status))}</Badge>
          <span>Issued {utc(invoice.issue_date).toLocaleDateString()}</span>
          {invoice.due_date && <span>Due {utc(invoice.due_date).toLocaleDateString()}</span>}
        </div>
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
              <span>{item.description} <span className="text-muted-foreground">× {item.qty}</span></span>
              <span className="shrink-0">{invoice.currency} {Number(item.amount).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-border pt-3 text-right text-sm">
          <p className="text-muted-foreground">Subtotal: {invoice.currency} {Number(invoice.subtotal).toFixed(2)}</p>
          {Number(invoice.tax_rate) > 0 && (
            <p className="text-muted-foreground">
              Tax ({invoice.tax_rate}%): {invoice.currency} {Number(invoice.tax_amount).toFixed(2)}
            </p>
          )}
          <p className="mt-1 text-base font-semibold">
            Total: {invoice.currency} {Number(invoice.total).toFixed(2)}
          </p>
        </div>
        {invoice.notes && (
          <div className="mt-4 border-t border-border pt-3 text-sm">
            <h2 className="mb-1 font-medium">Notes</h2>
            <p className="text-muted-foreground">{invoice.notes}</p>
          </div>
        )}
      </div>

      {methods.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
          <h2 className="mb-3 text-base font-semibold">How to pay</h2>
          <div className="space-y-3">
            {methods.map((method) => (
              <div key={method.id}>
                <p className="text-sm font-medium">{method.label}</p>
                {/* The operator formats these as lines of bank details; without
                    preserved whitespace every line collapses into one. */}
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{method.instructions}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <ProofSection invoiceId={id} invoiceStatus={String(invoice.status)} proofs={proofs} onUploaded={load} />
    </div>
  );
}

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/portal/invoices')
      .then(async (res) => { if (res.ok) setInvoices(await res.json()); })
      .finally(() => setLoading(false));
  }, []);

  if (openId) return <InvoiceDetail id={openId} onBack={() => setOpenId(null)} />;

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
    </p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Your invoices</h1>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <button
                type="button"
                onClick={() => setOpenId(invoice.id)}
                className="w-full rounded-xl border border-border bg-card p-4 text-left text-card-foreground hover:border-primary"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{invoice.invoice_number}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">{statusLabel(invoice.status)}</Badge>
                    <span className="font-medium">{invoice.currency} {Number(invoice.total).toFixed(2)}</span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Issued {utc(invoice.issue_date).toLocaleDateString()}
                  {invoice.due_date && ` · due ${utc(invoice.due_date).toLocaleDateString()}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
