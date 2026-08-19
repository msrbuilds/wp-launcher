import { Router, Response } from 'express';
import multer from 'multer';
import { conditionalAuth, AuthRequest } from '../middleware/userAuth';
import { getDb } from '../utils/db';
import { isFeatureEnabled } from '../services/features.service';
import {
  createClient, updateClient, deleteClient, getClient, listClients, getClientsCount,
  createProject, updateProject, deleteProject, getProject, listProjects, getProjectsCount,
  linkSiteToProject, unlinkSiteFromProject, getProjectSites,
  createInvoice, updateInvoice, deleteInvoice, getInvoice, listInvoices, getInvoicesCount, updateInvoiceStatus,
  listAllClients, listAllProjects, assertInvoiceIsDraft,
} from '../services/project.service';
import {
  listPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod,
  getInvoicePaymentMethods, setInvoicePaymentMethods,
} from '../services/paymentMethod.service';
import {
  getBoard, createColumn, updateColumn, deleteColumn, reorderColumns,
  createCard, updateCard, deleteCard, moveCard,
} from '../services/board.service';
import { seesAllRows } from '../utils/scope';
import {
  inviteClientUser, listClientUsers, revokeClientUser,
} from '../services/clientUser.service';
import { sendPortalInviteEmail } from '../services/email.service';
import {
  listProofsForInvoice, getStaffProof, acceptPaymentProof, rejectPaymentProof, countPendingProofs,
} from '../services/paymentProof.service';
import { readStoredFile, safeDownloadName, MAX_FILE_BYTES } from '../services/fileStore';
import {
  listCardComments, addCardComment, deleteCardComment,
  listCardAttachments, addCardAttachment, getCardAttachment, deleteCardAttachment,
  countsForProject,
} from '../services/cardActivity.service';
import { notifyClient, getNotificationMode, setNotificationMode } from '../services/notification.service';
import { listStaffClientMessages, postStaffMessage } from '../services/clientMessage.service';

const router = Router();

// In memory: the file is identified by its bytes before anything is written.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

function requireProjects(req: AuthRequest, res: Response, next: () => void) {
  // projects is admin-only, so this is false for members by construction —
  // see ADMIN_ONLY_FEATURES in features.service.
  if (!isFeatureEnabled('projects', req.userRole)) {
    res.status(403).json({ error: 'Projects feature is disabled' });
    return;
  }
  next();
}

/**
 * Payment methods are the business's bank details, install-wide rather than
 * per-user, so only owner/admin may change the list. Reading it is open to any
 * caller who already passed requireProjects, because attaching a method to an
 * invoice needs the list.
 */
function requirePrivileged(req: AuthRequest, res: Response, next: () => void) {
  if (!seesAllRows(req.userRole)) {
    res.status(403).json({ error: 'Only an owner or admin can manage payment methods' });
    return;
  }
  next();
}

// All routes require auth + feature enabled
router.use(conditionalAuth, requireProjects);

// ── Dropdown helpers ──

router.get('/dropdown/clients', (req: AuthRequest, res: Response) => {
  try {
    res.json(listAllClients(req.userId!));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/dropdown/projects', (req: AuthRequest, res: Response) => {
  try {
    res.json(listAllProjects(req.userId!));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Clients ──

router.get('/clients', (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string | undefined;
    const data = listClients(req.userId!, { search, limit, offset });
    const total = getClientsCount(req.userId!, search);
    res.json({ data, total, limit, offset });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/clients', (req: AuthRequest, res: Response) => {
  try {
    const client = createClient(req.userId!, req.body);
    res.status(201).json(client);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/clients/:id', (req: AuthRequest, res: Response) => {
  try {
    const client = getClient(req.params.id, req.userId!);
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
    res.json(client);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/clients/:id', (req: AuthRequest, res: Response) => {
  try {
    const client = updateClient(req.params.id, req.userId!, req.body);
    res.json(client);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/clients/:id', (req: AuthRequest, res: Response) => {
  try {
    deleteClient(req.params.id, req.userId!);
    res.json({ message: 'Client deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Projects ──

router.get('/list', (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const search = req.query.search as string | undefined;
    const data = listProjects(req.userId!, { status, clientId, search, limit, offset });
    const total = getProjectsCount(req.userId!, { status, clientId, search });
    res.json({ data, total, limit, offset });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/list', (req: AuthRequest, res: Response) => {
  try {
    const project = createProject(req.userId!, req.body);
    res.status(201).json(project);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/list/:id', (req: AuthRequest, res: Response) => {
  try {
    const project = getProject(req.params.id, req.userId!);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    const sites = getProjectSites(req.params.id, req.userId!);
    res.json({ ...project, sites });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/list/:id', (req: AuthRequest, res: Response) => {
  try {
    const project = updateProject(req.params.id, req.userId!, req.body);
    res.json(project);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/list/:id', (req: AuthRequest, res: Response) => {
  try {
    deleteProject(req.params.id, req.userId!);
    res.json({ message: 'Project deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/list/:id/sites', (req: AuthRequest, res: Response) => {
  try {
    linkSiteToProject(req.params.id, req.body.siteId, req.userId!);
    res.status(201).json({ message: 'Site linked' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/list/:id/sites/:siteId', (req: AuthRequest, res: Response) => {
  try {
    unlinkSiteFromProject(req.params.id, req.params.siteId, req.userId!);
    res.json({ message: 'Site unlinked' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Project board ──

router.get('/list/:id/board', (req: AuthRequest, res: Response) => {
  try {
    const board = getBoard(req.params.id, req.userId!);
    // Counts travel with the board so a card can show its badges without the
    // panel opening every card to find out whether it has anything on it.
    res.json({ ...board, activity: countsForProject(req.params.id) });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/list/:id/board/columns', (req: AuthRequest, res: Response) => {
  try {
    res.json(createColumn(req.params.id, req.userId!, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/list/:id/board/columns/reorder', (req: AuthRequest, res: Response) => {
  try {
    const { columnIds } = req.body || {};
    if (!Array.isArray(columnIds)) { res.status(400).json({ error: 'columnIds must be an array' }); return; }
    reorderColumns(req.params.id, req.userId!, columnIds);
    res.json(getBoard(req.params.id, req.userId!));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/board/columns/:columnId', (req: AuthRequest, res: Response) => {
  try {
    res.json(updateColumn(req.params.columnId, req.userId!, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/board/columns/:columnId', (req: AuthRequest, res: Response) => {
  try {
    deleteColumn(req.params.columnId, req.userId!);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/board/columns/:columnId/cards', (req: AuthRequest, res: Response) => {
  try {
    res.json(createCard(req.params.columnId, req.userId!, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/board/cards/:cardId', (req: AuthRequest, res: Response) => {
  try {
    res.json(updateCard(req.params.cardId, req.userId!, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/board/cards/:cardId', (req: AuthRequest, res: Response) => {
  try {
    deleteCard(req.params.cardId, req.userId!);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/board/cards/:cardId/move', (req: AuthRequest, res: Response) => {
  try {
    const { toColumnId, toIndex } = req.body || {};
    if (typeof toColumnId !== 'string' || typeof toIndex !== 'number') {
      res.status(400).json({ error: 'toColumnId must be a string and toIndex a number' });
      return;
    }
    moveCard(req.params.cardId, req.userId!, toColumnId, toIndex);
    res.json({ status: 'moved' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Invoices ──

router.get('/invoices', (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const data = listInvoices(req.userId!, { status, clientId, limit, offset });
    const total = getInvoicesCount(req.userId!, { status, clientId });
    res.json({ data, total, limit, offset });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/invoices', (req: AuthRequest, res: Response) => {
  try {
    const invoice = createInvoice(req.userId!, req.body);
    res.status(201).json(invoice);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/invoices/:id', (req: AuthRequest, res: Response) => {
  try {
    const invoice = getInvoice(req.params.id, req.userId!);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    res.json({
      ...invoice,
      items: JSON.parse(invoice.items as any),
      paymentMethods: getInvoicePaymentMethods(req.params.id),
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/invoices/:id', (req: AuthRequest, res: Response) => {
  try {
    const invoice = updateInvoice(req.params.id, req.userId!, req.body);
    res.json(invoice);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.patch('/invoices/:id/status', (req: AuthRequest, res: Response) => {
  try {
    const invoice = updateInvoiceStatus(req.params.id, req.userId!, req.body.status);
    res.json(invoice);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/invoices/:id', (req: AuthRequest, res: Response) => {
  try {
    deleteInvoice(req.params.id, req.userId!);
    res.json({ message: 'Invoice deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/invoices/:id/payment-methods', (req: AuthRequest, res: Response) => {
  try {
    // Authorise through the invoice the caller can actually see, so this never
    // becomes a way to probe invoice ids that belong to someone else.
    const invoice = getInvoice(req.params.id, req.userId!);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    res.json(getInvoicePaymentMethods(req.params.id));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/invoices/:id/payment-methods', (req: AuthRequest, res: Response) => {
  try {
    const invoice = getInvoice(req.params.id, req.userId!);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    // Same draft-only rule as updateInvoice: once sent, an invoice's content
    // (including which payment methods it carries) is fixed.
    assertInvoiceIsDraft(invoice);
    const ids = req.body?.methodIds;
    if (!Array.isArray(ids)) { res.status(400).json({ error: 'methodIds must be an array' }); return; }
    setInvoicePaymentMethods(req.params.id, ids);
    res.json(getInvoicePaymentMethods(req.params.id));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Payment methods ──

router.get('/payment-methods', (req: AuthRequest, res: Response) => {
  try {
    res.json(listPaymentMethods({ activeOnly: req.query.activeOnly === 'true' }));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/payment-methods', requirePrivileged, (req: AuthRequest, res: Response) => {
  try {
    res.json(createPaymentMethod(req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/payment-methods/:id', requirePrivileged, (req: AuthRequest, res: Response) => {
  try {
    res.json(updatePaymentMethod(req.params.id, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/payment-methods/:id', requirePrivileged, (req: AuthRequest, res: Response) => {
  try {
    deletePaymentMethod(req.params.id);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Portal logins ──

router.get('/clients/:id/portal-users', (req: AuthRequest, res: Response) => {
  try {
    res.json(listClientUsers(req.params.id, req.userId!));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/clients/:id/portal-users', async (req: AuthRequest, res: Response) => {
  try {
    const { record, token } = inviteClientUser(req.params.id, req.body?.email, req.userId!);
    // The invitation exists whether or not the mail goes out, so a bounced
    // send leaves the operator able to re-invite rather than losing the
    // account. Logged rather than swallowed.
    await sendPortalInviteEmail(record.email, token).catch((mailErr: any) => {
      console.error('[portal] Invite email failed:', mailErr.message);
    });
    res.json(record);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/portal-users/:id', (req: AuthRequest, res: Response) => {
  try {
    revokeClientUser(req.params.id, req.userId!);
    res.json({ status: 'revoked' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Card comments and attachments (staff only) ──

router.get('/board/cards/:cardId/comments', (req: AuthRequest, res: Response) => {
  try {
    res.json(listCardComments(req.params.cardId, req.userId!));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/board/cards/:cardId/comments', (req: AuthRequest, res: Response) => {
  try {
    res.json(addCardComment(req.params.cardId, req.userId!, req.body?.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/board/comments/:commentId', (req: AuthRequest, res: Response) => {
  try {
    deleteCardComment(req.params.commentId, req.userId!);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/board/cards/:cardId/attachments', (req: AuthRequest, res: Response) => {
  try {
    res.json(listCardAttachments(req.params.cardId, req.userId!));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/board/cards/:cardId/attachments', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!req.file?.buffer) { res.status(400).json({ error: 'Attach a file' }); return; }
    res.json(addCardAttachment(req.params.cardId, req.userId!, {
      buffer: req.file.buffer, originalName: req.file.originalname,
    }));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/board/attachments/:id/file', (req: AuthRequest, res: Response) => {
  try {
    const attachment = getCardAttachment(req.params.id, req.userId!);
    if (!attachment) { res.status(404).json({ error: 'Attachment not found' }); return; }
    res.setHeader('Content-Type', attachment.mime);
    res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName(attachment.original_name)}"`);
    res.send(readStoredFile(attachment.storage_path));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/board/attachments/:id', (req: AuthRequest, res: Response) => {
  try {
    deleteCardAttachment(req.params.id, req.userId!);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Payment proofs ──

/** How many proofs are waiting on a decision, for the badge on Invoices. */
router.get('/proofs/pending-count', (req: AuthRequest, res: Response) => {
  try {
    res.json({ count: countPendingProofs(req.userId!) });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/invoices/:id/proofs', (req: AuthRequest, res: Response) => {
  try {
    // Authorised through the invoice: getInvoice already filters by owner, so
    // a proof list cannot be read by knowing an invoice id alone.
    const invoice = getInvoice(req.params.id, req.userId!);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    res.json(listProofsForInvoice(req.params.id));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/proofs/:id/file', (req: AuthRequest, res: Response) => {
  try {
    const proof = getStaffProof(req.userId!, req.params.id);
    if (!proof) { res.status(404).json({ error: 'Payment proof not found' }); return; }
    res.setHeader('Content-Type', proof.mime);
    res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName(proof.original_name)}"`);
    res.send(readStoredFile(proof.storage_path));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/proofs/:id/accept', (req: AuthRequest, res: Response) => {
  try {
    const proof = acceptPaymentProof(req.userId!, req.params.id);
    const invoice = getInvoice(proof.invoice_id, req.userId!);
    if (invoice) {
      void notifyClient(invoice.client_id, {
        kind: 'proof.accepted',
        subject: `Payment received for ${invoice.invoice_number}`,
        heading: 'Thank you — your payment is confirmed',
        lines: [`${invoice.invoice_number} is now marked as paid.`],
        link: `/portal/invoices`,
      });
    }
    res.json(proof);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/proofs/:id/reject', (req: AuthRequest, res: Response) => {
  try {
    const proof = rejectPaymentProof(req.userId!, req.params.id, req.body?.reason);
    const invoice = getInvoice(proof.invoice_id, req.userId!);
    if (invoice) {
      void notifyClient(invoice.client_id, {
        kind: 'proof.rejected',
        subject: `We could not confirm your payment for ${invoice.invoice_number}`,
        heading: 'Your payment proof needs another look',
        lines: [
          `${invoice.invoice_number} is still outstanding.`,
          `Reason given: ${proof.reject_reason}`,
        ],
        link: `/portal/invoices`,
      });
    }
    res.json(proof);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Client conversation ──

router.get('/clients/:id/messages', (req: AuthRequest, res: Response) => {
  try {
    res.json(listStaffClientMessages(req.userId!, req.params.id));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/clients/:id/messages', (req: AuthRequest, res: Response) => {
  try {
    const message = postStaffMessage(req.userId!, req.params.id, {
      body: req.body?.body, projectId: req.body?.projectId, invoiceId: req.body?.invoiceId,
    });
    void notifyClient(req.params.id, {
      kind: 'message.fromStaff',
      subject: 'You have a new message',
      heading: `${message.author_label} wrote to you`,
      lines: [message.body],
      link: '/portal/messages',
    });
    res.json(message);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Email preference (the signed-in staff user's own) ──

router.get('/notification-pref', (req: AuthRequest, res: Response) => {
  res.json({ mode: getNotificationMode('staff', req.userId!) });
});

router.put('/notification-pref', (req: AuthRequest, res: Response) => {
  res.json({ mode: setNotificationMode('staff', req.userId!, req.body?.mode) });
});

export default router;
