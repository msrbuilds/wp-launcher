import { Router, Response } from 'express';
import { createSite, listSites, listUserSites, getSite, deleteSite, getSiteStatus } from '../services/site.service';
import { userAuth, optionalUserAuth, AuthRequest } from '../middleware/userAuth';

const router = Router();

// Create a new demo site (requires auth)
router.post('/', userAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, expiresIn } = req.body;

    if (!productId) {
      res.status(400).json({ error: 'productId is required' });
      return;
    }

    const site = await createSite({
      productId,
      expiresIn,
      userId: req.userId,
      userEmail: req.userEmail,
    });

    res.status(201).json({
      id: site.id,
      url: site.site_url,
      adminUrl: site.admin_url,
      credentials: {
        username: site.admin_user,
        password: site.admin_password,
      },
      expiresAt: site.expires_at,
      status: site.status,
    });
  } catch (err: any) {
    console.error('[sites] Error creating site:', err);
    const status = err.message.includes('already have an active') ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

// List sites - if authenticated, show user's sites; otherwise show all active
router.get('/', optionalUserAuth, (req: AuthRequest, res: Response) => {
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

    res.json(
      sites.map((s) => ({
        id: s.id,
        subdomain: s.subdomain,
        productId: s.product_id,
        url: s.site_url,
        adminUrl: s.admin_url,
        credentials: req.userId ? {
          username: s.admin_user,
          password: s.admin_password,
        } : undefined,
        status: s.status,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific site
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const site = getSite(req.params.id);
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
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
        password: site.admin_password,
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
router.get('/:id/status', async (req: AuthRequest, res: Response) => {
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
router.get('/:id/ready', async (req: AuthRequest, res: Response) => {
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

    // Probe the site's login page via the internal Docker network
    // The container name is wp-demo-{subdomain}
    const internalUrl = `http://wp-demo-${site.subdomain}/wp-login.php`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const probe = await fetch(internalUrl, {
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // wp-login.php returns 200 when WP is installed, or redirects to install.php if not
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
router.delete('/:id', userAuth, async (req: AuthRequest, res: Response) => {
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
