import { Router, Request, Response, NextFunction } from 'express';
import { isFeatureEnabled } from '../services/features.service';
import { authorizationServerMetadata, protectedResourceMetadata } from '../oauth/metadata';

const router = Router();

/** With MCP off the discovery documents are absent, not refused. */
export function requireMcpFeature(_req: Request, res: Response, next: NextFunction): void {
  if (!isFeatureEnabled('mcp', 'admin')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}

router.use(requireMcpFeature);

router.get('/oauth-authorization-server', (_req, res) => {
  res.json(authorizationServerMetadata());
});

// Served at the root and path-suffixed forms: clients differ in which they probe.
router.get(['/oauth-protected-resource', '/oauth-protected-resource/api/mcp'], (_req, res) => {
  res.json(protectedResourceMetadata());
});

export default router;
