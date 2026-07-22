import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAdminHeaders } from './AdminLayout';
import { useBranding } from '../../context/SettingsContext';
import { Invoice, InvoiceLineItem } from './shared';
import { apiFetch } from '../../utils/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const headers = useAdminHeaders();
  const navigate = useNavigate();
  const branding = useBranding();
  const [invoice, setInvoice] = useState<(Invoice & { clientName: string | null; clientEmail?: string; clientCompany?: string; clientPhone?: string; projectName: string | null }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/projects/invoices/${id}`, { headers })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setInvoice(null); return; }
        const items = typeof data.items === 'string' ? JSON.parse(data.items) : data.items;
        setInvoice({ ...data, items });
        // Also fetch client details for the print view
        if (data.client_id) {
          apiFetch(`/api/projects/clients/${data.client_id}`, { headers })
            .then(r => r.json())
            .then(client => {
              if (!client.error) {
                setInvoice(prev => prev ? { ...prev, clientEmail: client.email, clientCompany: client.company, clientPhone: client.phone } : prev);
              }
            }).catch(() => {});
        }
      })
      .catch(() => setInvoice(null))
      .finally(() => setLoading(false));
  }, [id, headers]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <p className="text-sm text-muted-foreground">Invoice not found.</p>
      </div>
    );
  }

  const STATUS_LABELS: Record<string, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' };

  return (
    <div>
      {/* Screen-only toolbar — hidden from the printed sheet. */}
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button variant="secondary" size="sm" onClick={() => navigate('/invoices')}>
          <ArrowLeft /> Back
        </Button>
        <Button size="sm" onClick={() => window.print()}>Print / Save PDF</Button>
      </div>

      {/*
        The invoice sheet deliberately opts out of light/dark theming: it is a
        document meant to be printed or exported to PDF on white paper, so it is
        pinned to `bg-white text-black` instead of the themed surface tokens.
        Dark-mode colours would either invert on paper or waste toner.
      */}
      <div className="mx-auto max-w-3xl rounded-xl border border-black/15 bg-white p-8 text-black shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{branding.siteTitle || 'WP Launcher'}</h2>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold tracking-tight">{invoice.invoice_number}</h1>
            <div className="mt-2 space-y-0.5 text-sm">
              <div>Issue Date: <strong>{new Date(invoice.issue_date + 'Z').toLocaleDateString()}</strong></div>
              {invoice.due_date && <div>Due Date: <strong>{new Date(invoice.due_date + 'Z').toLocaleDateString()}</strong></div>}
            </div>
            <Badge variant="outline" className="mt-2 border-black/30 text-black">
              {STATUS_LABELS[invoice.status] || invoice.status}
            </Badge>
          </div>
        </div>

        <div className="mb-8 text-sm">
          <h4 className="mb-1 font-semibold uppercase tracking-wide">Bill To:</h4>
          <p className="font-medium">{invoice.clientName}</p>
          {invoice.clientCompany && <p>{invoice.clientCompany}</p>}
          {invoice.clientEmail && <p>{invoice.clientEmail}</p>}
          {invoice.clientPhone && <p>{invoice.clientPhone}</p>}
          {invoice.projectName && <p className="mt-1">Project: {invoice.projectName}</p>}
        </div>

        <Table className="text-black">
          <TableHeader>
            <TableRow className="border-black/20 hover:bg-transparent">
              <TableHead className="text-black">#</TableHead>
              <TableHead className="text-black">Description</TableHead>
              <TableHead className="text-black">Qty</TableHead>
              <TableHead className="text-black">Rate</TableHead>
              <TableHead className="text-black">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(invoice.items as InvoiceLineItem[]).map((item, i) => (
              <TableRow key={i} className="border-black/10 hover:bg-transparent">
                <TableCell>{i + 1}</TableCell>
                <TableCell className="whitespace-normal">{item.description}</TableCell>
                <TableCell>{item.qty}</TableCell>
                <TableCell>{invoice.currency} {Number(item.rate).toFixed(2)}</TableCell>
                <TableCell>{invoice.currency} {Number(item.amount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span><span>{invoice.currency} {invoice.subtotal.toFixed(2)}</span>
          </div>
          {invoice.tax_rate > 0 && (
            <div className="flex justify-between">
              <span>Tax ({invoice.tax_rate}%)</span><span>{invoice.currency} {invoice.tax_amount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-black/20 pt-2 text-base font-semibold">
            <span>Total</span><span>{invoice.currency} {invoice.total.toFixed(2)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 border-t border-black/15 pt-4 text-sm">
            <h4 className="mb-1 font-semibold uppercase tracking-wide">Notes</h4>
            <p>{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
