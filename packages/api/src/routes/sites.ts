import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { createSite, listSites, listUserSites, getSite, deleteSite, getSiteStatus, MAX_SITES_PER_USER } from '../services/site.service';
import { conditionalAuth, conditionalOptionalAuth, AuthRequest } from '../middleware/userAuth';
import { config } from '../config';

const router = Router();

// Skip rate limiting for admin (API key) requests
function isAdminRequest(req: Request): boolean {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey || !config.apiKey) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(config.apiKey));
  } catch {
    return false;
  }
}

// Tight limit on write operations (create/delete) — 10 per 15 min per IP
const siteWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isAdminRequest,
});

// Generous limit on read/polling operations — 120 per 15 min per IP
// (allows ~30 ready-polls per site launch with headroom for listing/status)
const siteReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isAdminRequest,
});

// Create a new demo site (requires auth)
router.post('/', siteWriteLimiter, conditionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, expiresIn, siteTitle, adminUser, adminPassword, adminEmail, dbEngine, phpVersion, subdomain } = req.body;

    if (!productId) {
      res.status(400).json({ error: 'productId is required' });
      return;
    }

    const site = await createSite({
      productId,
      expiresIn,
      userId: req.userId,
      userEmail: req.userEmail,
      siteTitle,
      adminUser,
      adminPassword,
      adminEmail,
      dbEngine,
      phpVersion,
      subdomain,
    });

    res.status(201).json({
      id: site.id,
      url: site.site_url,
      adminUrl: site.admin_url,
      autoLoginUrl: `${site.site_url}/wp-login.php?autologin=${site.autoLoginToken}`,
      credentials: {
        username: site.admin_user,
        password: site.oneTimePassword,
      },
      expiresAt: site.expires_at,
      status: site.status,
    });
  } catch (err: any) {
    console.error('[sites] Error creating site:', err);
    const status = err.message.includes('already have') ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

// List sites - if authenticated, show user's sites; otherwise show all active
router.get('/', siteReadLimiter, conditionalOptionalAuth, (req: AuthRequest, res: Response) => {
  try {
    const productId = req.query.productId as string | undefined;
    let sites;

    if (req.userId && !req.query.all) {
      sites = listUserSites(req.userId);
    } else if (productId) {
      sites = listSites(productId);
    } else {
      sites = listSites();
    }

    const mapped = sites.map((s) => ({
      id: s.id,
      subdomain: s.subdomain,
      productId: s.product_id,
      url: s.site_url,
      adminUrl: s.admin_url,
      autoLoginUrl: req.userId && s.auto_login_token
        ? `${s.site_url}/wp-login.php?autologin=${s.auto_login_token}`
        : undefined,
      credentials: req.userId ? {
        username: s.admin_user,
      } : undefined,
      status: s.status,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
    }));

    if (req.userId) {
      res.json({ sites: mapped, maxSites: MAX_SITES_PER_USER });
    } else {
      res.json(mapped);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific site (requires auth, users can only view their own)
router.get('/:id', siteReadLimiter, conditionalAuth, (req: AuthRequest, res: Response) => {
  try {
    const site = getSite(req.params.id);
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    if (site.user_id && site.user_id !== req.userId) {
      res.status(403).json({ error: 'You can only view your own sites' });
      return;
    }

    res.json({
      id: site.id,
      subdomain: site.subdomain,
      productId: site.product_id,
      url: site.site_url,
      adminUrl: site.admin_url,
      credentials: {
        username: site.admin_user,
      },
      status: site.status,
      createdAt: site.created_at,
      expiresAt: site.expires_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get site status
router.get('/:id/status', siteReadLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const status = await getSiteStatus(req.params.id);
    res.json(status);
  } catch (err: any) {
    if (err.message === 'Site not found') {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Check if site's WordPress is fully ready (installed and responding)
router.get('/:id/ready', siteReadLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const site = getSite(req.params.id);
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    if (site.status !== 'running' || !site.site_url) {
      res.json({ ready: false, reason: 'container not running' });
      return;
    }

    // Probe the ready marker file written by entrypoint.sh after ALL setup completes
    // (plugins, themes, demo content — not just WP core install)
    const markerUrl = `http://wp-demo-${site.subdomain}/.wp-launcher-ready`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const probe = await fetch(markerUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const ready = probe.status === 200;
      res.json({ ready });
    } catch {
      res.json({ ready: false, reason: 'site not responding' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a site (requires auth - users can only delete their own)
router.delete('/:id', siteWriteLimiter, conditionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    await deleteSite(req.params.id, req.userId, req.userEmail);
    res.json({ message: 'Site deleted successfully' });
  } catch (err: any) {
    if (err.message === 'Site not found') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err.message.includes('only delete your own')) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
