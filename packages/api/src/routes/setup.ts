import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { runSetup, isSetupComplete } from '../services/setup.service';
import { generateToken } from '../middleware/userAuth';
import { config } from '../config';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Setup is unauthenticated by necessity, so limit it hard.
const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/status', (_req: Request, res: Response) => {
  res.json({ setupComplete: isSetupComplete() });
});

router.post('/', setupLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, panelName } = req.body;
  const owner = await runSetup({ email, password, panelName });

  const token = generateToken(owner.id, owner.email, owner.role);
  res.cookie('wpl_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({ user: { id: owner.id, email: owner.email, role: owner.role } });
}));

export default router;
