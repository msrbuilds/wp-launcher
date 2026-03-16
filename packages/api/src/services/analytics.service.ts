import { getDb } from '../utils/db';

interface TimeSeriesPoint {
  date: string;
  count: number;
}

interface ProductPopularity {
  productId: string;
  launches: number;
}

interface AnalyticsSummary {
  avgLifetimeHours: number | null;
  peakHour: number | null;
  sitesToday: number;
  sitesThisWeek: number;
  sitesThisMonth: number;
}

export function getLaunchesOverTime(days: number, productId?: string): TimeSeriesPoint[] {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  if (productId) {
    return db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM site_logs WHERE action = 'created' AND created_at >= ? AND product_id = ?
      GROUP BY date(created_at) ORDER BY date
    `).all(since, productId) as TimeSeriesPoint[];
  }

  return db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM site_logs WHERE action = 'created' AND created_at >= ?
    GROUP BY date(created_at) ORDER BY date
  `).all(since) as TimeSeriesPoint[];
}

export function getProductPopularity(): ProductPopularity[] {
  const db = getDb();
  return db.prepare(`
    SELECT product_id as productId, COUNT(*) as launches
    FROM site_logs WHERE action = 'created'
    GROUP BY product_id ORDER BY launches DESC
  `).all() as ProductPopularity[];
}

export function getRegistrationsOverTime(days: number): TimeSeriesPoint[] {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM users WHERE created_at >= ?
    GROUP BY date(created_at) ORDER BY date
  `).all(since) as TimeSeriesPoint[];
}

export function getActiveSitesOverTime(days: number): TimeSeriesPoint[] {
  const db = getDb();
  const results: TimeSeriesPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86400000);
    const dateStr = date.toISOString().split('T')[0];
    const endOfDay = dateStr + 'T23:59:59.999Z';

    const row = db.prepare(`
      SELECT COUNT(*) as count FROM sites
      WHERE created_at <= ? AND (deleted_at IS NULL OR deleted_at > ?) AND status != 'error'
    `).get(endOfDay, endOfDay) as { count: number };

    results.push({ date: dateStr, count: row.count });
  }

  return results;
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const db = getDb();

  // Average site lifetime (hours) for deleted sites
  const avgRow = db.prepare(`
    SELECT AVG((julianday(deleted_at) - julianday(created_at)) * 24) as avg_hours
    FROM sites WHERE deleted_at IS NOT NULL
  `).get() as { avg_hours: number | null };

  // Peak hour of site creation
  const peakRow = db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as cnt
    FROM site_logs WHERE action = 'created'
    GROUP BY hour ORDER BY cnt DESC LIMIT 1
  `).get() as { hour: number; cnt: number } | undefined;

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const todayRow = db.prepare(`
    SELECT COUNT(*) as count FROM site_logs WHERE action = 'created' AND date(created_at) = ?
  `).get(today) as { count: number };

  const weekRow = db.prepare(`
    SELECT COUNT(*) as count FROM site_logs WHERE action = 'created' AND created_at >= ?
  `).get(weekAgo) as { count: number };

  const monthRow = db.prepare(`
    SELECT COUNT(*) as count FROM site_logs WHERE action = 'created' AND created_at >= ?
  `).get(monthAgo) as { count: number };

  return {
    avgLifetimeHours: avgRow.avg_hours ? Math.round(avgRow.avg_hours * 10) / 10 : null,
    peakHour: peakRow?.hour ?? null,
    sitesToday: todayRow.count,
    sitesThisWeek: weekRow.count,
    sitesThisMonth: monthRow.count,
  };
}
