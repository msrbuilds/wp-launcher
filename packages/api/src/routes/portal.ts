import { Router, Request, Response } from 'express';
import {
  clientAuth, ClientAuthRequest, generateClientToken, CLIENT_COOKIE, CLIENT_COOKIE_PATH,
} from '../middleware/clientAuth';
import { acceptInvite, authenticateClientUser, getClientUserById } from '../services/clientUser.service';
import {
  getPortalProjects, getPortalProject, getPortalInvoices, getPortalInvoice,
} from '../services/portal.service';
import { isFeatureEnabled } from '../services/features.service';
import { config } from '../config';

const router = Router();

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
  res.json({ ...result, invoice: { ...result.invoice, items } });
});

export default router;
