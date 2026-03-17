import { Router, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { AuthRequest } from '../middleware/userAuth';
import { config } from '../config';
import { listUsers, getUsersCount, deleteUser, updateUserRole } from '../services/user.service';
import { listWebhooks, createWebhook, deleteWebhook, toggleWebhook } from '../services/webhook.service';
import {
  listAllSites,
  getAllSitesCount,
  getSiteLogs,
  getSiteLogsCount,
  getSiteLogsByUser,
  getSiteStats,
  deleteSite,
} from '../services/site.service';
import { getDb } from '../utils/db';

const router = Router();

// All admin routes require admin role (JWT with role=admin) or API key (M2M)
router.use(adminAuth);

// Dashboard stats
// In local mode, only count local-user's sites
router.get('/stats', (_req: AuthRequest, res: Response) => {
  try {
    if (config.isLocalMode) {
      const db = getDb();
      const totalSitesCreated = (db.prepare("SELECT COUNT(*) as count FROM site_logs WHERE action = 'created' AND user_id = 'local-user'").get() as { count: number }).count;
      const activeSites = (db.prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running' AND user_id = 'local-user'").get() as { count: number }).count;
      res.json({ totalSitesCreated, activeSites, totalUsers: 1, verifiedUsers: 1 });
    } else {
      const stats = getSiteStats();
      res.json(stats);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List all users (paginated)
router.get('/users', (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const users = listUsers(limit, offset);
    const total = getUsersCount();
    res.json({
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        verified: !!u.verified,
        role: u.role || 'user',
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      })),
      total,
      limit,
      offset,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a user
router.delete('/users/:id', (req: AuthRequest, res: Response) => {
  try {
    deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List all sites (paginated, including expired)
// In local mode, only show sites owned by local-user
router.get('/sites', (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const db = getDb();
    let sites, total: number;
    if (config.isLocalMode) {
      sites = db.prepare("SELECT * FROM sites WHERE user_id = 'local-user' ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset) as any[];
      total = (db.prepare("SELECT COUNT(*) as count FROM sites WHERE user_id = 'local-user'").get() as { count: number }).count;
    } else {
      sites = listAllSites(limit, offset);
      total = getAllSitesCount();
    }
    res.json({
      data: sites.map((s: any) => ({
        id: s.id,
        subdomain: s.subdomain,
        productId: s.product_id,
        userId: s.user_id,
        url: s.site_url,
        status: s.status,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        deletedAt: s.deleted_at,
      })),
      total,
      limit,
      offset,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Force delete a site (admin)
router.delete('/sites/:id', async (req: AuthRequest, res: Response) => {
  try {
    await deleteSite(req.params.id);
    res.json({ message: 'Site deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Site logs (paginated)
// In local mode, only show logs from local-user
router.get('/logs', (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    let logs, total: number;
    if (config.isLocalMode) {
      const db = getDb();
      logs = db.prepare("SELECT * FROM site_logs WHERE user_id = 'local-user' ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
      total = (db.prepare("SELECT COUNT(*) as count FROM site_logs WHERE user_id = 'local-user'").get() as { count: number }).count;
    } else {
      logs = getSiteLogs(limit, offset);
      total = getSiteLogsCount();
    }
    res.json({ data: logs, total, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Site logs for a specific user
router.get('/logs/user/:userId', (req: AuthRequest, res: Response) => {
  try {
    const logs = getSiteLogsByUser(req.params.userId);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update user role (promote/demote)
router.patch('/users/:id/role', (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    if (role !== 'admin' && role !== 'user') {
      res.status(400).json({ error: 'Role must be "admin" or "user"' });
      return;
    }
    updateUserRole(req.params.id, role);
    res.json({ message: `User role updated to ${role}` });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

// Promote user by email (used by CLI)
router.post('/users/promote', (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    const targetRole = role === 'user' ? 'user' : 'admin';
    const db = require('../utils/db').getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    updateUserRole(user.id, targetRole);
    res.json({ message: `${email} is now ${targetRole}` });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

// --- Webhooks ---

router.get('/webhooks', (req: AuthRequest, res: Response) => {
  try {
    const webhooks = listWebhooks();
    res.json({ webhooks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/webhooks', (req: AuthRequest, res: Response) => {
  try {
    const { url, events, secret } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL is required' });
      return;
    }
    try { new URL(url); } catch { res.status(400).json({ error: 'Invalid URL' }); return; }
    const eventList = Array.isArray(events) ? events : ['site.created', 'site.expired', 'site.deleted'];
    const webhook = createWebhook(url, eventList, secret);
    res.status(201).json(webhook);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/webhooks/:id', (req: AuthRequest, res: Response) => {
  try {
    const { active } = req.body;
    toggleWebhook(req.params.id, !!active);
    res.json({ status: 'updated' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/webhooks/:id', (req: AuthRequest, res: Response) => {
  try {
    deleteWebhook(req.params.id);
    res.json({ message: 'Webhook deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
