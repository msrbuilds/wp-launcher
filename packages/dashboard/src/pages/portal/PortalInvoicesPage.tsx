import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '../../utils/api';

interface InvoiceSummary {
  id: string; invoice_number: string; total: number; currency: string;
  status: string; issue_date: string; due_date: string | null;
}
interface LineItem { description: string; qty: number; rate: number; amount: number }
interface PaymentMethod { id: string; label: string; instructions: string }

const utc = (ts: string) => new Date(`${ts.includes('T') ? ts : ts.replace(' ', 'T')}Z`);

function InvoiceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [invoice, setInvoice] = useState<Record<string, any> | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/portal/invoices/${id}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setInvoice(data.invoice);
        setMethods(data.paymentMethods || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

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
          <Badge variant="secondary">{invoice.status}</Badge>
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
                    <Badge variant="secondary">{invoice.status}</Badge>
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
