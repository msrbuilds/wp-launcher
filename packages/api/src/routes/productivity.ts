import { Router, Response, NextFunction } from 'express';
import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { conditionalAuth, AuthRequest } from '../middleware/userAuth';
import { config } from '../config';
import { validateRemoteUrl, safeFetch } from '../utils/ssrf';
import { seesAllRows } from '../utils/scope';
import { getDb } from '../utils/db';
import {
  insertHeartbeats, isDuplicate,
  getStatsForDate, getStatsForRange, getDailyTotals,
  getProjectBreakdown, getLanguageBreakdown, getCategoryBreakdown, getSourceBreakdown,
  getSessionsForDate,
  getHourlyActivity, getWeekdayActivity, getScreenBreakdown, getWriteEvents, getSummaryStats,
  getGoal, setGoal,
  getCurrentStreak,
  getCloudConfig, setCloudConfig, deleteCloudAccount,
  ensureHeartbeatSecret, rotateHeartbeatSecret,
  getSyncLogs,
  clearOldData, clearAllData,
  HeartbeatInput,
} from '../services/productivity.service';
import { triggerManualSync } from '../services/productivity-sync.service';
import { isLocalDeployment, publicApiBaseUrl } from '../utils/deployment';
import { getSetting, setSetting } from '../services/settings.service';
import { isFeatureEnabled } from '../services/features.service';
import {
  DESTINATION_SETTING_KEY, DESTINATIONS, parseDestination, resolveSyncEnabled,
} from '../services/productivity-destination';

const router = Router();

// Parse text/plain bodies as JSON (sendBeacon uses text/plain to avoid CORS preflight)
router.use('/heartbeats', express.text({ type: 'text/plain', limit: '1mb' }), (req: any, _res: Response, next: () => void) => {
  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch { /* leave as-is */ }
  }
  next();
});

// SBP-004: Restrict CORS to known local origins instead of reflecting any origin.
// Only *.localhost and *.BASE_DOMAIN sites should submit heartbeats.
function isAllowedHeartbeatOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const baseDomain = (config as any).baseDomain?.toLowerCase() || '';
    if (host === 'localhost' || host.endsWith('.localhost')) return origin;
    if (baseDomain && (host === baseDomain || host.endsWith(`.${baseDomain}`))) return origin;
    return null;
  } catch { return null; }
}

router.use('/heartbeats', (req: any, res: Response, next: () => void) => {
  const allowed = isAllowedHeartbeatOrigin(req.headers.origin);
  if (allowed) {
    res.header('Access-Control-Allow-Origin', allowed);
  }
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Also allow CORS for cloud/status (used by MU-plugin to check if tracking is active)
router.use('/cloud/status', (req: any, res: Response, next: () => void) => {
  const allowed = isAllowedHeartbeatOrigin(req.headers.origin);
  if (allowed) {
    res.header('Access-Control-Allow-Origin', allowed);
  }
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function requireFeature(req: AuthRequest, res: Response, next: () => void) {
  // productivityMonitor is admin-only, so this is false for members by
  // construction — see ADMIN_ONLY_FEATURES in features.service.
  if (!isFeatureEnabled('productivityMonitor', req.userRole)) {
    res.status(403).json({ error: 'Productivity Monitor feature is disabled' });
    return;
  }
  next();
}

/**
 * Ingestion and status are machine endpoints with no session: the heartbeat
 * secret authenticates them, not a role. They ask whether the install has the
 * feature enabled at all, which is the admin flag — resolving them by role
 * would treat every client as anonymous and reject them.
 */
function requireFeatureForMachineClients(_req: AuthRequest, res: Response, next: () => void) {
  if (!isFeatureEnabled('productivityMonitor', 'admin')) {
    res.status(403).json({ error: 'Productivity Monitor feature is disabled' });
    return;
  }
  next();
}

// SBP-004: Rate limit heartbeat ingestion — 60 requests per minute per IP
const heartbeatLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
router.use('/heartbeats', heartbeatLimiter);

// Cloud status — no auth, used by extensions and MU-plugin to check if tracking is active.
// `linked` is kept for older clients that only understand cloud linking.
router.get('/cloud/status', requireFeatureForMachineClients, (_req: AuthRequest, res: Response) => {
  try {
    const cfg = getCloudConfig();
    const cloudLinked = !!(cfg.cloud_url && cfg.cloud_api_key);
    const isLocal = isLocalDeployment();
    const destination = parseDestination(getSetting(DESTINATION_SETTING_KEY));
    res.json({
      linked: cloudLinked,
      featureEnabled: true,
      // Tracking is live as soon as the install has a secret — a cloud account is
      // no longer a prerequisite, only a destination.
      tracking: !!cfg.heartbeat_secret,
      cloudLinked,
      isLocal,
      destination,
      syncing: resolveSyncEnabled({ destination, cloudLinked, isLocal }),
      apiBaseUrl: publicApiBaseUrl(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Heartbeat ingestion requires the feature enabled AND a valid heartbeat secret.
// SBP-004: the secret authenticates non-browser clients (extensions, MU-plugin)
// that cannot use cookie auth or custom headers via sendBeacon. A linked cloud
// account is deliberately NOT required — a localhost install stores locally and
// shows its own dashboard without any cloud involvement.
router.post('/heartbeats', requireFeatureForMachineClients, (req: AuthRequest, res: Response) => {
  try {
    const cloudCfg = getCloudConfig();

    // SBP-004: Validate per-install heartbeat secret
    const secret = req.body?.secret;
    if (!cloudCfg.heartbeat_secret || !secret || secret !== cloudCfg.heartbeat_secret) {
      res.status(401).json({ error: 'Invalid or missing heartbeat secret' });
      return;
    }

    const { heartbeats } = req.body;
    if (!Array.isArray(heartbeats) || heartbeats.length === 0) {
      res.status(400).json({ error: 'heartbeats array is required' });
      return;
    }
    if (heartbeats.length > 100) {
      res.status(400).json({ error: 'Max 100 heartbeats per batch' });
      return;
    }

    // Filter out duplicates
    const unique = heartbeats.filter((hb: HeartbeatInput) => !isDuplicate(hb));
    const received = insertHeartbeats(unique);
    res.json({ received });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SBP-003: these stats/config routes return install-wide, non-user-scoped data,
// so only callers who may already see every row can read them. This replaces the
// old local-mode check — the protection is "you can see everything anyway",
// which under roles means owner or admin.
function requireGlobalReader(req: AuthRequest, res: Response, next: () => void) {
  if (!seesAllRows(req.userRole)) {
    res.status(403).json({ error: 'Productivity Monitor requires an admin or owner account' });
    return;
  }
  next();
}

/**
 * The per-install heartbeat secret already authenticates editor clients for
 * ingestion, and the panel surfaces it for exactly that purpose. Accepting it
 * for reads too means an editor needs one credential, not two — asking for a
 * second one invites pasting the wrong key, which is a support problem rather
 * than a security gain: its holder is already trusted at install level.
 */
function hasValidHeartbeatSecret(req: AuthRequest): boolean {
  const provided = req.headers['x-wpl-secret'];
  if (typeof provided !== 'string' || !provided) return false;
  const expected = getCloudConfig().heartbeat_secret;
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function statsAuth(req: AuthRequest, res: Response, next: () => void) {
  if (hasValidHeartbeatSecret(req)) {
    req.userId = 'heartbeat-client';
    req.userRole = 'admin';
    return next();
  }
  return conditionalAuth(req, res, next as NextFunction);
}

// All other routes require auth + feature enabled + global read access
router.use(statsAuth, requireFeature, requireGlobalReader);

// ── Stats ──

router.get('/stats/today', (req: AuthRequest, res: Response) => {
  try {
    const source = req.query.source as string | undefined;
    const today = new Date().toISOString().slice(0, 10);
    const stats = getStatsForDate(today, source);
    const goal = getGoal();
    const streak = getCurrentStreak();
    res.json({ ...stats, goal: goal.dailyGoalSeconds, streak });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/range', (req: AuthRequest, res: Response) => {
  try {
    const source = req.query.source as string | undefined;
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 14, 1), 90);
    const stats = getStatsForRange(days, source);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/daily', (req: AuthRequest, res: Response) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 14, 1), 90);
    const source = req.query.source as string | undefined;
    const totals = getDailyTotals(days, source);
    res.json(totals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/projects', (req: AuthRequest, res: Response) => {
  try {
    const source = req.query.source as string | undefined;
    const start = (req.query.start as string) || `${new Date().toISOString().slice(0, 10)} 00:00:00`;
    const end = (req.query.end as string) || `${new Date().toISOString().slice(0, 10)} 23:59:59`;
    res.json(getProjectBreakdown(start, end, source));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/languages', (req: AuthRequest, res: Response) => {
  try {
    const start = (req.query.start as string) || `${new Date().toISOString().slice(0, 10)} 00:00:00`;
    const end = (req.query.end as string) || `${new Date().toISOString().slice(0, 10)} 23:59:59`;
    res.json(getLanguageBreakdown(start, end));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/categories', (req: AuthRequest, res: Response) => {
  try {
    const start = (req.query.start as string) || `${new Date().toISOString().slice(0, 10)} 00:00:00`;
    const end = (req.query.end as string) || `${new Date().toISOString().slice(0, 10)} 23:59:59`;
    res.json(getCategoryBreakdown(start, end));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/sources', (req: AuthRequest, res: Response) => {
  try {
    const start = (req.query.start as string) || `${new Date().toISOString().slice(0, 10)} 00:00:00`;
    const end = (req.query.end as string) || `${new Date().toISOString().slice(0, 10)} 23:59:59`;
    res.json(getSourceBreakdown(start, end));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions/today', (req: AuthRequest, res: Response) => {
  try {
    const source = req.query.source as string | undefined;
    const today = new Date().toISOString().slice(0, 10);
    res.json(getSessionsForDate(today, source));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Extended Stats ──

router.get('/stats/hourly', (req: AuthRequest, res: Response) => {
  try {
    const source = req.query.source as string | undefined;
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    res.json(getHourlyActivity(date, source));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/weekdays', (req: AuthRequest, res: Response) => {
  try {
    const source = req.query.source as string | undefined;
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    res.json(getWeekdayActivity(days, source));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/screens', (req: AuthRequest, res: Response) => {
  try {
    const start = (req.query.start as string) || `${new Date().toISOString().slice(0, 10)} 00:00:00`;
    const end = (req.query.end as string) || `${new Date().toISOString().slice(0, 10)} 23:59:59`;
    res.json(getScreenBreakdown(start, end));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/summary', (req: AuthRequest, res: Response) => {
  try {
    const source = req.query.source as string | undefined;
    const days = Math.min(parseInt(req.query.days as string) || 14, 90);
    const today = new Date().toISOString().slice(0, 10);
    const summary = getSummaryStats(today, days, source);
    const goal = getGoal();
    const streak = getCurrentStreak();
    res.json({ ...summary, goal: goal.dailyGoalSeconds, streak });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Goals ──

router.get('/goals', (_req: AuthRequest, res: Response) => {
  try {
    res.json(getGoal());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/goals', (req: AuthRequest, res: Response) => {
  try {
    const { dailyGoalSeconds } = req.body;
    if (typeof dailyGoalSeconds !== 'number') {
      res.status(400).json({ error: 'dailyGoalSeconds is required' });
      return;
    }
    setGoal(dailyGoalSeconds);
    res.json(getGoal());
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Cloud Config ──

router.get('/cloud/config', (_req: AuthRequest, res: Response) => {
  try {
    const config = getCloudConfig();
    // Don't expose the API key fully
    if (config.cloud_api_key) {
      config.cloud_api_key = config.cloud_api_key.slice(0, 12) + '...';
    }
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/cloud/config', async (req: AuthRequest, res: Response) => {
  try {
    const { cloud_url, cloud_api_key, device_name, machine_id } = req.body;
    if (!cloud_url || !cloud_api_key) {
      res.status(400).json({ error: 'cloud_url and cloud_api_key are required' });
      return;
    }

    const cleanUrl = cloud_url.replace(/\/+$/, '');

    // SBP-005: Validate cloud URL against SSRF before making any server-side request
    const urlCheck = await validateRemoteUrl(cleanUrl);
    if (!urlCheck.valid) {
      res.status(400).json({ error: urlCheck.error || 'Invalid cloud URL' });
      return;
    }

    // Verify connection by sending an empty heartbeat batch to the sync endpoint
    try {
      const testRes = await safeFetch(`${cleanUrl}/api/v1/sync/heartbeats`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cloud_api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ heartbeats: [], batch_id: 'verify', total_count: 0 }),
        signal: AbortSignal.timeout(10000),
      });
      if (testRes.status === 401 || testRes.status === 403) {
        const body = await testRes.json().catch(() => ({ error: '' })) as { error?: string };
        res.status(400).json({ error: body.error || 'Invalid API key — the cloud service rejected the key' });
        return;
      }
      // 400 is OK — means auth passed but empty payload was rejected (expected)
      // 200 also OK. Only reject on 401/403 (bad key) or 5xx (server error)
      if (testRes.status >= 500) {
        res.status(400).json({ error: `Cloud service error (${testRes.status}). Try again later.` });
        return;
      }
    } catch (fetchErr: any) {
      const msg = fetchErr.name === 'TimeoutError'
        ? 'Connection timed out — could not reach the cloud service'
        : `Could not connect to ${cleanUrl} — ${fetchErr.message}`;
      res.status(400).json({ error: msg });
      return;
    }

    setCloudConfig('cloud_url', cleanUrl);
    setCloudConfig('cloud_api_key', cloud_api_key);
    if (device_name) setCloudConfig('device_name', device_name);
    if (machine_id) setCloudConfig('machine_id', machine_id);

    // Linking a cloud account must NOT rotate the heartbeat secret: running demo
    // sites carry it as a baked-in env var and would silently stop reporting.
    // Mint one only if this install somehow has none yet.
    const heartbeatSecret = ensureHeartbeatSecret();

    res.json({ message: 'Cloud account linked successfully', verified: true, heartbeat_secret: heartbeatSecret });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/cloud/config', (_req: AuthRequest, res: Response) => {
  try {
    // Unlink the account but keep the heartbeat secret — local tracking survives.
    deleteCloudAccount();
    res.json({ message: 'Cloud account unlinked. Local tracking continues.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Heartbeat secret ──

router.get('/secret', (_req: AuthRequest, res: Response) => {
  try {
    res.json({ heartbeat_secret: ensureHeartbeatSecret(), apiBaseUrl: publicApiBaseUrl() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rotating invalidates the secret baked into every running demo site, so it is an
// explicit action and the response says what breaks.
router.post('/secret/rotate', (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      heartbeat_secret: rotateHeartbeatSecret(),
      warning: 'Existing demo sites keep the previous secret and stop reporting until they are relaunched.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tracking destination ──

router.get('/destination', (_req: AuthRequest, res: Response) => {
  try {
    const cfg = getCloudConfig();
    const cloudLinked = !!(cfg.cloud_url && cfg.cloud_api_key);
    const isLocal = isLocalDeployment();
    const destination = parseDestination(getSetting(DESTINATION_SETTING_KEY));
    res.json({
      destination,
      options: DESTINATIONS,
      isLocal,
      cloudLinked,
      syncing: resolveSyncEnabled({ destination, cloudLinked, isLocal }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/destination', (req: AuthRequest, res: Response) => {
  try {
    const requested = String(req.body?.destination ?? '');
    if (!(DESTINATIONS as readonly string[]).includes(requested)) {
      res.status(400).json({ error: `destination must be one of: ${DESTINATIONS.join(', ')}` });
      return;
    }
    setSetting(DESTINATION_SETTING_KEY, requested);
    const cfg = getCloudConfig();
    const cloudLinked = !!(cfg.cloud_url && cfg.cloud_api_key);
    const isLocal = isLocalDeployment();
    const destination = parseDestination(requested);
    res.json({
      destination,
      syncing: resolveSyncEnabled({ destination, cloudLinked, isLocal }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cloud Sync ──

router.post('/cloud/sync', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await triggerManualSync();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cloud/sync-log', (_req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt((_req.query.limit as string) || '20');
    res.json(getSyncLogs(Math.min(limit, 100)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Data Management ──

router.delete('/data', (req: AuthRequest, res: Response) => {
  try {
    const olderThan = parseInt(req.query.olderThan as string);
    let deleted: number;
    if (olderThan && olderThan > 0) {
      deleted = clearOldData(olderThan);
    } else {
      deleted = clearAllData();
    }
    res.json({ deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
