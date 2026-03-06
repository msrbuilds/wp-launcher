import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { apiKeyAuth } from './middleware/auth';
import sitesRouter from './routes/sites';
import productsRouter from './routes/products';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import { startCleanupScheduler, cleanupOrphanedContainers } from './services/cleanup.service';
import { closeDb } from './utils/db';

const app = express();

// Middleware
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? [config.publicUrl, `https://${config.baseDomain}`]
    : true, // Allow all origins in development
  credentials: true,
}));
app.use(express.json());

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for admin endpoints (brute-force protection)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public with rate limiting)
app.use('/api/auth', authLimiter, authRouter);

// Sites routes (auth handled per-route inside the router)
app.use('/api/sites', sitesRouter);

// Products routes
app.use('/api/products', (req, res, next) => {
  if (req.method === 'GET') {
    return next();
  }
  return apiKeyAuth(req, res, next);
}, productsRouter);

// Admin routes (API key protected + rate limited)
app.use('/api/admin', adminLimiter, adminRouter);

// Start server
const server = app.listen(config.port, () => {
  console.log(`[api] WP Launcher API running on port ${config.port}`);
  console.log(`[api] Base domain: ${config.baseDomain}`);
  console.log(`[api] Environment: ${config.nodeEnv}`);
});

// Start cleanup scheduler
startCleanupScheduler();

// Run orphan cleanup every 5 minutes
setInterval(() => {
  cleanupOrphanedContainers().catch((err) => {
    console.error('[api] Orphan cleanup error:', err);
  });
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[api] Shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[api] Shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});
