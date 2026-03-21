import { Router, Response } from 'express';
import { conditionalAuth, AuthRequest } from '../middleware/userAuth';
import { getDb } from '../utils/db';
import {
  createClient, updateClient, deleteClient, getClient, listClients, getClientsCount,
  createProject, updateProject, deleteProject, getProject, listProjects, getProjectsCount,
  linkSiteToProject, unlinkSiteFromProject, getProjectSites,
  createInvoice, updateInvoice, deleteInvoice, getInvoice, listInvoices, getInvoicesCount, updateInvoiceStatus,
  listAllClients, listAllProjects,
} from '../services/project.service';

const router = Router();

function isFeatureEnabled(key: string): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(`feature.${key}`) as { value: string } | undefined;
  return row?.value === 'true';
}

function requireProjects(_req: AuthRequest, res: Response, next: () => void) {
  if (!isFeatureEnabled('projects')) {
    res.status(403).json({ error: 'Projects feature is disabled' });
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
    res.json({ ...invoice, items: JSON.parse(invoice.items as any) });
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

export default router;
