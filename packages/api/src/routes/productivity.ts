import { Router, Response } from 'express';
import express from 'express';
import { conditionalAuth, AuthRequest } from '../middleware/userAuth';
import { getDb } from '../utils/db';
import {
  insertHeartbeats, isDuplicate,
  getStatsForDate, getDailyTotals,
  getProjectBreakdown, getLanguageBreakdown, getCategoryBreakdown, getSourceBreakdown,
  getSessionsForDate,
  getHourlyActivity, getWeekdayActivity, getScreenBreakdown, getWriteEvents, getSummaryStats,
  getGoal, setGoal,
  getCurrentStreak,
  getCloudConfig, setCloudConfig, deleteCloudConfig,
  getSyncLogs,
  clearOldData, clearAllData,
  HeartbeatInput,
} from '../services/productivity.service';
import { triggerManualSync } from '../services/productivity-sync.service';

const router = Router();

// Parse text/plain bodies as JSON (sendBeacon uses text/plain to avoid CORS preflight)
router.use('/heartbeats', express.text({ type: 'text/plain', limit: '1mb' }), (req: any, _res: Response, next: () => void) => {
  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch { /* leave as-is */ }
  }
  next();
});

// Allow cross-origin heartbeat requests from any *.localhost / *.BASE_DOMAIN site
// Override Helmet's restrictive headers for this endpoint
router.use('/heartbeats', (req: any, res: Response, next: () => void) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
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
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function isFeatureEnabled(): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get('feature.productivityMonitor') as { value: string } | undefined;
  return row?.value === 'true';
}

function requireFeature(_req: AuthRequest, res: Response, next: () => void) {
  if (!isFeatureEnabled()) {
    res.status(403).json({ error: 'Productivity Monitor feature is disabled' });
    return;
  }
  next();
}

// Cloud status — no auth, used by extensions and MU-plugin to check if tracking is active
router.get('/cloud/status', requireFeature, (_req: AuthRequest, res: Response) => {
  try {
    const config = getCloudConfig();
    const linked = !!(config.cloud_url && config.cloud_api_key);
    res.json({ linked, featureEnabled: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Heartbeat endpoint doesn't require auth (extensions need unauthenticated access)
// but requires feature enabled AND cloud account linked
router.post('/heartbeats', requireFeature, (req: AuthRequest, res: Response) => {
  try {
    // Require cloud account to be linked before recording stats
    const config = getCloudConfig();
    if (!config.cloud_url || !config.cloud_api_key) {
      res.status(403).json({ error: 'Cloud account not linked. Connect your account in the Productivity page to start tracking.' });
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

// All other routes require auth + feature enabled
router.use(conditionalAuth, requireFeature);

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

    // Verify connection by sending an empty heartbeat batch to the sync endpoint
    try {
      const testRes = await fetch(`${cleanUrl}/api/v1/sync/heartbeats`, {
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
    res.json({ message: 'Cloud account linked successfully', verified: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/cloud/config', (_req: AuthRequest, res: Response) => {
  try {
    deleteCloudConfig();
    res.json({ message: 'Cloud config removed' });
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
