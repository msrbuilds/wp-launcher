import { Router, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { AuthRequest } from '../middleware/userAuth';
import {
  getLaunchesOverTime,
  getProductPopularity,
  getRegistrationsOverTime,
  getActiveSitesOverTime,
  getAnalyticsSummary,
} from '../services/analytics.service';

const router = Router();

// All analytics routes require admin role or API key
router.use(adminAuth);

// Site launches over time
router.get('/launches', (req: AuthRequest, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  const productId = req.query.productId as string | undefined;
  res.json({ data: getLaunchesOverTime(days, productId) });
});

// Product popularity
router.get('/products', (_req: AuthRequest, res: Response) => {
  res.json({ data: getProductPopularity() });
});

// User registrations over time
router.get('/registrations', (req: AuthRequest, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  res.json({ data: getRegistrationsOverTime(days) });
});

// Active sites over time
router.get('/active-sites', (req: AuthRequest, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 90);
  res.json({ data: getActiveSitesOverTime(days) });
});

// Summary stats
router.get('/summary', (_req: AuthRequest, res: Response) => {
  res.json(getAnalyticsSummary());
});

export default router;
