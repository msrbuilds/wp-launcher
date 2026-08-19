import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  clientAuth, ClientAuthRequest, generateClientToken, CLIENT_COOKIE, CLIENT_COOKIE_PATH,
} from '../middleware/clientAuth';
import { acceptInvite, authenticateClientUser, getClientUserById } from '../services/clientUser.service';
import {
  getPortalProjects, getPortalProject, getPortalInvoices, getPortalInvoice,
} from '../services/portal.service';
import {
  createPaymentProof, getClientProof, listProofsForInvoice,
} from '../services/paymentProof.service';
import { readStoredFile, safeDownloadName, MAX_FILE_BYTES } from '../services/fileStore';
import { notifyStaff, getNotificationMode, setNotificationMode } from '../services/notification.service';
import { listClientMessages, postClientMessage } from '../services/clientMessage.service';
import { isFeatureEnabled } from '../services/features.service';
import { getDb } from '../utils/db';
import { config } from '../config';

const router = Router();

// In memory, because the file is validated by its bytes before anything is
// written. Multer's own limit stops an oversized upload at the socket rather
// than after buffering it whole.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

/**
 * The portal is off unless the operator turns it on, and that is checked
 * before anything else — including sign-in — so a disabled portal cannot be
 * probed for which addresses hold accounts. 404 rather than 403: a feature
 * that is off should look absent, not merely refused.
 */
router.use((_req: Request, res: Response, next) => {
  if (!isFeatureEnabled('clientPortal', 'admin')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

function setPortalCookie(res: Response, token: string): void {
  res.cookie(CLIENT_COOKIE, token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: CLIENT_COOKIE_PATH,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post('/auth/accept-invite', (req: Request, res: Response) => {
  try {
    const record = acceptInvite(req.body?.token, req.body?.password);
    setPortalCookie(res, generateClientToken(record.id, record.client_id, record.token_version));
    res.json({ email: record.email });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const record = await authenticateClientUser(req.body?.email, req.body?.password);
    setPortalCookie(res, generateClientToken(record.id, record.client_id, record.token_version));
    res.json({ email: record.email });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie(CLIENT_COOKIE, { path: CLIENT_COOKIE_PATH });
  res.json({ status: 'signed out' });
});

router.get('/auth/me', clientAuth, (req: ClientAuthRequest, res: Response) => {
  const record = getClientUserById(req.clientUserId!);
  res.json({ email: record?.email, clientId: req.clientId });
});

// Every read below takes req.clientId, set by clientAuth from the verified
// token. No handler reads a client id from the request.
router.get('/projects', clientAuth, (req: ClientAuthRequest, res: Response) => {
  res.json(getPortalProjects(req.clientId!));
});

router.get('/projects/:id', clientAuth, (req: ClientAuthRequest, res: Response) => {
  const result = getPortalProject(req.clientId!, req.params.id);
  if (!result) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(result);
});

router.get('/invoices', clientAuth, (req: ClientAuthRequest, res: Response) => {
  res.json(getPortalInvoices(req.clientId!));
});

router.get('/invoices/:id', clientAuth, (req: ClientAuthRequest, res: Response) => {
  const result = getPortalInvoice(req.clientId!, req.params.id);
  if (!result) { res.status(404).json({ error: 'Not found' }); return; }
  let items: unknown = [];
  try { items = JSON.parse(String(result.invoice.items ?? '[]')); } catch { items = []; }
  // The client sees their own submissions and the decision on each, so a
  // rejection reaches them here as well as by email.
  const proofs = listProofsForInvoice(req.params.id).map((proof) => ({
    id: proof.id, original_name: proof.original_name, mime: proof.mime,
    size_bytes: proof.size_bytes, amount: proof.amount, note: proof.note,
    status: proof.status, reject_reason: proof.reject_reason, created_at: proof.created_at,
  }));
  res.json({ ...result, invoice: { ...result.invoice, items }, proofs });
});

// ── Payment proofs ──

router.post('/invoices/:id/proofs', clientAuth, upload.single('file'), async (req: ClientAuthRequest, res: Response) => {
  try {
    if (!req.file?.buffer) { res.status(400).json({ error: 'Attach the payment document' }); return; }
    const proof = createPaymentProof(
      req.clientId!, req.params.id, req.clientUserId!,
      { buffer: req.file.buffer, originalName: req.file.originalname },
      { amount: req.body?.amount, note: req.body?.note },
    );

    // Fire and forget: the proof is recorded, and an unreachable mail server
    // must not turn a successful upload into an error the client retries.
    const invoice = getDb()
      .prepare('SELECT user_id, invoice_number FROM invoices WHERE id = ?')
      .get(req.params.id) as { user_id: string; invoice_number: string } | undefined;
    if (invoice) {
      void notifyStaff(invoice.user_id, {
        kind: 'proof.uploaded',
        subject: `Payment proof submitted for ${invoice.invoice_number}`,
        heading: 'A client sent proof of payment',
        lines: [
          `${invoice.invoice_number} is now awaiting your verification.`,
          proof.amount != null ? `They stated an amount of ${proof.amount}.` : 'No amount was stated.',
          proof.note ? `Their note: ${proof.note}` : 'They left no note.',
        ],
        link: `/invoices/${req.params.id}`,
      });
    }

    res.json(proof);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * Payment documents are served only through this route, never from a static
 * path: a guessable URL for someone's bank receipt is a leak nobody notices.
 */
router.get('/proofs/:id/file', clientAuth, (req: ClientAuthRequest, res: Response) => {
  try {
    const proof = getClientProof(req.clientId!, req.params.id);
    if (!proof) { res.status(404).json({ error: 'Not found' }); return; }
    res.setHeader('Content-Type', proof.mime);
    res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName(proof.original_name)}"`);
    res.send(readStoredFile(proof.storage_path));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Messages ──

router.get('/messages', clientAuth, (req: ClientAuthRequest, res: Response) => {
  res.json(listClientMessages(req.clientId!));
});

router.post('/messages', clientAuth, (req: ClientAuthRequest, res: Response) => {
  try {
    const message = postClientMessage(req.clientId!, req.clientUserId!, {
      body: req.body?.body, projectId: req.body?.projectId, invoiceId: req.body?.invoiceId,
    });

    // The operator is not sitting in the panel waiting; without this the
    // conversation only works when they happen to look.
    const owner = getDb().prepare('SELECT user_id FROM clients WHERE id = ?').get(req.clientId!) as
      { user_id: string } | undefined;
    if (owner) {
      void notifyStaff(owner.user_id, {
        kind: 'message.fromClient',
        subject: `New message from ${message.author_label}`,
        heading: 'A client wrote to you',
        lines: [message.body],
        link: '/clients',
      });
    }

    res.json(message);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Email preference ──

router.get('/notification-pref', clientAuth, (req: ClientAuthRequest, res: Response) => {
  res.json({ mode: getNotificationMode('client', req.clientUserId!) });
});

router.put('/notification-pref', clientAuth, (req: ClientAuthRequest, res: Response) => {
  res.json({ mode: setNotificationMode('client', req.clientUserId!, req.body?.mode) });
});

export default router;
