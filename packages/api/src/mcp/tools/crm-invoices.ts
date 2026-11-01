import { z } from 'zod';
import * as projectService from '../../services/project.service';
import * as paymentMethodService from '../../services/paymentMethod.service';
import * as paymentProofService from '../../services/paymentProof.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { defineTool, type ToolDef } from '../registry';

const invoiceId = z.string().min(1).describe('Invoice id, from crm_invoices_list.');
const invoiceStatus = z.enum(['draft', 'sent', 'awaiting_verification', 'paid', 'overdue', 'cancelled']);
const lineItem = z.object({
  description: z.string().min(1).max(500),
  qty: z.number().positive().describe('Quantity, greater than 0.'),
  rate: z.number().min(0).describe('Unit price, in the invoice currency.'),
});

const invoiceSchema = z.object({
  id: z.string(), number: z.string(), status: z.string(), clientId: z.string(), clientName: z.string().nullable(),
  projectId: z.string().nullable(), projectName: z.string().nullable(), currency: z.string(),
  subtotal: z.number(), taxRate: z.number(), taxAmount: z.number(), total: z.number(),
  issueDate: z.string(), dueDate: z.string().nullable(), notes: z.string().nullable(), updatedAt: z.string(),
});
const methodSchema = z.object({ id: z.string(), label: z.string(), instructions: z.string(), active: z.boolean() });

function toInvoiceView(i: Record<string, any>) {
  return {
    id: i.id, number: i.invoice_number, status: i.status, clientId: i.client_id, clientName: i.clientName ?? null,
    projectId: i.project_id ?? null, projectName: i.projectName ?? null, currency: i.currency, subtotal: i.subtotal,
    taxRate: i.tax_rate, taxAmount: i.tax_amount, total: i.total, issueDate: i.issue_date, dueDate: i.due_date ?? null,
    notes: i.notes ?? null, updatedAt: i.updated_at,
  };
}
const toMethod = (m: paymentMethodService.PaymentMethodRecord) => ({ id: m.id, label: m.label, instructions: m.instructions, active: !!m.active });

/**
 * The payment-method and proof services take no user id, so every tool that
 * reaches them authorises through the invoice first, exactly as the REST routes
 * do — otherwise they would be a way to probe other users' invoice ids.
 */
function invoiceOrFail(id: string, userId: string) {
  const invoice = projectService.getInvoice(id, userId);
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}

const read = { scope: 'crm:read' as const, feature: 'projects', annotations: { readOnlyHint: true, idempotentHint: true } };
const write = { scope: 'invoices:write' as const, feature: 'projects', writeBucket: 'crm' as const };

export const crmInvoicesList = defineTool({
  name: 'crm_invoices_list',
  title: 'List invoices',
  description: 'Lists your invoices, newest first. Requires crm:read.',
  ...read,
  input: z.object({ status: invoiceStatus.optional(), clientId: z.string().optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional() }),
  output: z.object({ invoices: z.array(invoiceSchema), total: z.number() }),
  handler: ({ limit, offset, ...filters }, ctx) => ({
    invoices: projectService.listInvoices(ctx.userId, { ...filters, limit: limit ?? 50, offset }).map(toInvoiceView),
    total: projectService.getInvoicesCount(ctx.userId, filters),
  }),
});

export const crmInvoicesGet = defineTool({
  name: 'crm_invoices_get',
  title: 'Get an invoice',
  description: 'Returns one of your invoices with its line items and attached payment methods. Requires crm:read.',
  ...read,
  input: z.object({ invoiceId }),
  // Output items are what the panel stored, so none of the input limits apply here.
  output: z.object({ invoice: invoiceSchema.extend({ items: z.array(z.object({ description: z.string(), qty: z.number(), rate: z.number(), amount: z.number() })), paymentMethods: z.array(methodSchema) }) }),
  handler: ({ invoiceId: id }, ctx) => {
    const invoice = invoiceOrFail(id, ctx.userId);
    return {
      invoice: {
        ...toInvoiceView(invoice),
        items: JSON.parse(invoice.items || '[]'),
        paymentMethods: paymentMethodService.getInvoicePaymentMethods(id).map(toMethod),
      },
    };
  },
});

export const crmPaymentMethodsList = defineTool({
  name: 'crm_payment_methods_list',
  title: 'List payment methods',
  description: 'Lists the business’s payment methods (bank details) that can be attached to invoices. Requires crm:read.',
  ...read,
  input: z.object({ activeOnly: z.boolean().optional().describe('Only methods offered on new invoices.') }),
  output: z.object({ methods: z.array(methodSchema) }),
  handler: ({ activeOnly }) => ({ methods: paymentMethodService.listPaymentMethods({ activeOnly }).map(toMethod) }),
});

export const crmProofsList = defineTool({
  name: 'crm_proofs_list',
  title: 'List payment proofs',
  description: 'Lists the proofs of payment a client uploaded for one of your invoices. Reviewing (accept or reject) is done by a person in the panel, never by an agent. Requires crm:read.',
  ...read,
  input: z.object({ invoiceId }),
  output: z.object({
    proofs: z.array(z.object({
      id: z.string(), originalName: z.string(), mime: z.string(), sizeBytes: z.number(), amount: z.number().nullable(), note: z.string().nullable(),
      status: z.string(), rejectReason: z.string().nullable(), createdAt: z.string(),
    })),
  }),
  handler: ({ invoiceId: id }, ctx) => {
    invoiceOrFail(id, ctx.userId);
    return {
      proofs: paymentProofService.listProofsForInvoice(id).map((p) => ({
        id: p.id, originalName: p.original_name, mime: p.mime, sizeBytes: p.size_bytes, amount: p.amount, note: p.note,
        status: p.status, rejectReason: p.reject_reason, createdAt: p.created_at,
      })),
    };
  },
});

export const crmInvoicesCreate = defineTool({
  name: 'crm_invoices_create',
  title: 'Draft an invoice',
  description: 'Creates a draft invoice for one of your clients. Drafts are invisible to the client until sent. Requires invoices:write.',
  ...write, annotations: {},
  input: z.object({
    clientId: z.string().min(1), projectId: z.string().optional(), items: z.array(lineItem).min(1).max(100),
    taxRate: z.number().min(0).max(100).optional().describe('Percent, e.g. 10 for 10%.'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD.'),
    currency: z.string().min(3).max(3).optional().describe('ISO code, e.g. USD. Defaults to USD.'),
    notes: z.string().max(5000).optional(),
  }),
  output: z.object({ invoice: invoiceSchema }),
  handler: ({ clientId, projectId, taxRate, dueDate, ...rest }, ctx) => {
    const created = projectService.createInvoice(ctx.userId, { ...rest, client_id: clientId, project_id: projectId, tax_rate: taxRate, due_date: dueDate });
    return { invoice: toInvoiceView(invoiceOrFail(created.id, ctx.userId)) };
  },
});

export const crmInvoicesUpdate = defineTool({
  name: 'crm_invoices_update',
  title: 'Edit a draft invoice',
  description: 'Changes the fields you pass on a draft invoice. Sent invoices cannot be edited. Requires invoices:write.',
  ...write, annotations: { idempotentHint: true },
  input: z.object({
    invoiceId, items: z.array(lineItem).min(1).max(100).optional(), taxRate: z.number().min(0).max(100).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), currency: z.string().min(3).max(3).optional(),
    notes: z.string().max(5000).optional(), projectId: z.string().nullable().optional(),
  }),
  output: z.object({ invoice: invoiceSchema }),
  handler: ({ invoiceId: id, taxRate, dueDate, projectId, ...rest }, ctx) => {
    projectService.updateInvoice(id, ctx.userId, {
      ...rest,
      ...(taxRate !== undefined ? { tax_rate: taxRate } : {}),
      ...(dueDate !== undefined ? { due_date: dueDate } : {}),
      ...(projectId !== undefined ? { project_id: projectId } : {}),
    });
    return { invoice: toInvoiceView(invoiceOrFail(id, ctx.userId)) };
  },
});

export const crmInvoicesDelete = defineTool({
  name: 'crm_invoices_delete',
  title: 'Delete a draft invoice',
  description: 'Deletes a draft invoice. Sent invoices cannot be deleted; cancel them instead. Requires invoices:write.',
  ...write, annotations: { destructiveHint: true },
  input: z.object({ invoiceId }),
  output: z.object({ deleted: z.literal(true) }),
  handler: ({ invoiceId: id }, ctx) => {
    invoiceOrFail(id, ctx.userId);
    projectService.deleteInvoice(id, ctx.userId);
    return { deleted: true as const };
  },
});

/** The only transitions an agent may make. Everything touching money stays with a person. */
const AGENT_TRANSITIONS: Record<'sent' | 'cancelled', string[]> = {
  sent: ['draft'],
  cancelled: ['draft', 'sent', 'overdue'],
};

export const crmInvoicesSetStatus = defineTool({
  name: 'crm_invoices_set_status',
  title: 'Send or cancel an invoice',
  description: 'Sends a draft invoice to the client (it appears in their portal), or cancels an invoice that has not been paid. An agent can never mark an invoice paid, act on one awaiting verification of a payment proof, or cancel a paid one; tell the user to do those in the panel. Requires invoices:write.',
  ...write, annotations: { destructiveHint: true },
  input: z.object({ invoiceId, status: z.enum(['sent', 'cancelled']) }),
  output: z.object({ invoice: invoiceSchema }),
  handler: ({ invoiceId: id, status }, ctx) => {
    const current = invoiceOrFail(id, ctx.userId);
    const allowedFrom = (AGENT_TRANSITIONS as Record<string, string[]>)[status] ?? [];
    if (!allowedFrom.includes(current.status)) {
      throw new ValidationError('Agents may only send a draft or cancel an unpaid invoice — use the panel for this change');
    }
    projectService.updateInvoiceStatus(id, ctx.userId, status);
    return { invoice: toInvoiceView(invoiceOrFail(id, ctx.userId)) };
  },
});

export const crmInvoicesSetPaymentMethods = defineTool({
  name: 'crm_invoices_set_payment_methods',
  title: 'Choose an invoice’s payment methods',
  description: 'Replaces the payment methods shown on a draft invoice (ids from crm_payment_methods_list). Requires invoices:write.',
  ...write, annotations: { idempotentHint: true },
  input: z.object({ invoiceId, methodIds: z.array(z.string()).max(20) }),
  output: z.object({ paymentMethods: z.array(methodSchema) }),
  handler: ({ invoiceId: id, methodIds }, ctx) => {
    const invoice = invoiceOrFail(id, ctx.userId);
    projectService.assertInvoiceIsDraft(invoice);
    paymentMethodService.setInvoicePaymentMethods(id, methodIds);
    return { paymentMethods: paymentMethodService.getInvoicePaymentMethods(id).map(toMethod) };
  },
});

export const crmInvoiceTools: ToolDef[] = [
  crmInvoicesList, crmInvoicesGet, crmPaymentMethodsList, crmProofsList,
  crmInvoicesCreate, crmInvoicesUpdate, crmInvoicesDelete, crmInvoicesSetStatus, crmInvoicesSetPaymentMethods,
];
