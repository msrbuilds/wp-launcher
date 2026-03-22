import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode, useBranding } from '../../context/SettingsContext';
import { Invoice, InvoiceLineItem } from './shared';
import { apiFetch } from '../../utils/api';

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const headers = useAdminHeaders();
  const navigate = useNavigate();
  const isLocal = useIsLocalMode();
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

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;
  if (!invoice) return <div className="card"><p>Invoice not found.</p></div>;

  const STATUS_LABELS: Record<string, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' };

  return (
    <div className="ip-page">
      <div className="ip-print-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(isLocal ? '/invoices' : '/admin/invoices')}>&larr; Back</button>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="ip-invoice">
        <div className="ip-header">
          <div className="ip-brand">
            <h2>{branding.siteTitle || 'WP Launcher'}</h2>
          </div>
          <div className="ip-meta">
            <h1 className="ip-invoice-number">{invoice.invoice_number}</h1>
            <div className="ip-dates">
              <div>Issue Date: <strong>{new Date(invoice.issue_date + 'Z').toLocaleDateString()}</strong></div>
              {invoice.due_date && <div>Due Date: <strong>{new Date(invoice.due_date + 'Z').toLocaleDateString()}</strong></div>}
            </div>
            <span className={`badge badge-${invoice.status} ip-status-badge`}>{STATUS_LABELS[invoice.status] || invoice.status}</span>
          </div>
        </div>

        <div className="ip-client-info">
          <h4>Bill To:</h4>
          <p className="ip-client-name">{invoice.clientName}</p>
          {invoice.clientCompany && <p>{invoice.clientCompany}</p>}
          {invoice.clientEmail && <p>{invoice.clientEmail}</p>}
          {invoice.clientPhone && <p>{invoice.clientPhone}</p>}
          {invoice.projectName && <p className="ip-project-ref">Project: {invoice.projectName}</p>}
        </div>

        <table className="ip-items-table">
          <thead>
            <tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {(invoice.items as InvoiceLineItem[]).map((item, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{item.description}</td>
                <td>{item.qty}</td>
                <td>{invoice.currency} {Number(item.rate).toFixed(2)}</td>
                <td>{invoice.currency} {Number(item.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ip-totals">
          <div className="ip-totals-row"><span>Subtotal</span><span>{invoice.currency} {invoice.subtotal.toFixed(2)}</span></div>
          {invoice.tax_rate > 0 && <div className="ip-totals-row"><span>Tax ({invoice.tax_rate}%)</span><span>{invoice.currency} {invoice.tax_amount.toFixed(2)}</span></div>}
          <div className="ip-totals-row ip-grand-total"><span>Total</span><span>{invoice.currency} {invoice.total.toFixed(2)}</span></div>
        </div>

        {invoice.notes && (
          <div className="ip-notes">
            <h4>Notes</h4>
            <p>{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
