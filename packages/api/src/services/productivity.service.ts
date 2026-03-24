import { getDb } from '../utils/db';

// ── Interfaces ──

export interface HeartbeatInput {
  source: 'editor' | 'wordpress';
  entity: string;
  entity_type?: string;
  project?: string;
  language?: string;
  category?: string;
  editor?: string;
  site_id?: string;
  machine_id?: string;
  branch?: string;
  is_write?: boolean;
  time?: string;
}

interface HeartbeatRow {
  id: number;
  source: string;
  entity: string;
  entity_type: string;
  project: string | null;
  language: string | null;
  category: string | null;
  editor: string | null;
  site_id: string | null;
  machine_id: string | null;
  branch: string | null;
  is_write: number;
  created_at: string;
  synced: number;
}

export interface DayStats {
  totalSeconds: number;
  bySource: { source: string; totalSeconds: number }[];
  byProject: { project: string; totalSeconds: number }[];
  byLanguage: { language: string; totalSeconds: number }[];
  byCategory: { category: string; totalSeconds: number }[];
  byEditor: { editor: string; totalSeconds: number }[];
  heartbeatCount: number;
}

export interface DailyTotal {
  date: string;
  totalSeconds: number;
  editorSeconds: number;
  wordpressSeconds: number;
}

export interface SessionInfo {
  start: string;
  end: string;
  durationSeconds: number;
  source: string;
  project: string | null;
}

// ── Constants ──

const SESSION_TIMEOUT = 15 * 60; // 15 minutes in seconds
const WRITE_CREDIT = 2 * 60; // 2 minutes minimum credit for write heartbeats
const MAX_ENTITY_LEN = 500;
const MAX_FIELD_LEN = 200;

// ── Time Calculation ──

export function calculateCodingTime(heartbeats: { created_at: string }[]): number {
  if (heartbeats.length === 0) return 0;
  const sorted = [...heartbeats].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  let totalSeconds = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime()) / 1000;
    if (gap <= SESSION_TIMEOUT) {
      totalSeconds += gap;
    }
  }
  return Math.round(totalSeconds);
}

function calculateSessions(heartbeats: HeartbeatRow[]): SessionInfo[] {
  if (heartbeats.length === 0) return [];
  const sorted = [...heartbeats].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const sessions: SessionInfo[] = [];
  let sessionStart = sorted[0];
  let sessionEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].created_at).getTime() - new Date(sessionEnd.created_at).getTime()) / 1000;
    if (gap <= SESSION_TIMEOUT) {
      sessionEnd = sorted[i];
    } else {
      sessions.push({
        start: sessionStart.created_at,
        end: sessionEnd.created_at,
        durationSeconds: Math.round(
          (new Date(sessionEnd.created_at).getTime() - new Date(sessionStart.created_at).getTime()) / 1000
        ),
        source: sessionStart.source,
        project: sessionStart.project,
      });
      sessionStart = sorted[i];
      sessionEnd = sorted[i];
    }
  }
  // Push final session
  sessions.push({
    start: sessionStart.created_at,
    end: sessionEnd.created_at,
    durationSeconds: Math.round(
      (new Date(sessionEnd.created_at).getTime() - new Date(sessionStart.created_at).getTime()) / 1000
    ),
    source: sessionStart.source,
    project: sessionStart.project,
  });
  return sessions;
}

// ── Validation ──

function truncate(val: string | undefined | null, max: number): string | null {
  if (!val) return null;
  return val.slice(0, max);
}

function validateHeartbeat(hb: HeartbeatInput): void {
  if (!hb.source || !['editor', 'wordpress'].includes(hb.source)) {
    throw new Error('source must be "editor" or "wordpress"');
  }
  if (!hb.entity || typeof hb.entity !== 'string') {
    throw new Error('entity is required');
  }
  if (hb.time) {
    const ts = new Date(hb.time).getTime();
    if (isNaN(ts)) throw new Error('Invalid timestamp');
    // Reject heartbeats older than 7 days
    if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) {
      throw new Error('Heartbeat too old (max 7 days)');
    }
  }
}

// ── Heartbeat Storage ──

export function insertHeartbeats(heartbeats: HeartbeatInput[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO productivity_heartbeats (source, entity, entity_type, project, language, category, editor, site_id, machine_id, branch, is_write, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  const insertMany = db.transaction((items: HeartbeatInput[]) => {
    for (const hb of items) {
      try {
        validateHeartbeat(hb);
      } catch {
        continue; // Skip invalid heartbeats
      }
      const createdAt = hb.time ? new Date(hb.time).toISOString().replace('T', ' ').replace('Z', '') : undefined;
      stmt.run(
        hb.source,
        truncate(hb.entity, MAX_ENTITY_LEN),
        hb.entity_type || (hb.source === 'wordpress' ? 'wp-screen' : 'file'),
        truncate(hb.project, MAX_FIELD_LEN),
        truncate(hb.language, MAX_FIELD_LEN),
        truncate(hb.category, MAX_FIELD_LEN),
        truncate(hb.editor, MAX_FIELD_LEN),
        truncate(hb.site_id, MAX_FIELD_LEN),
        truncate(hb.machine_id, MAX_FIELD_LEN),
        truncate(hb.branch, MAX_FIELD_LEN),
        hb.is_write ? 1 : 0,
        createdAt,
      );
      count++;
    }
  });

  insertMany(heartbeats);
  return count;
}

// ── Deduplication ──

export function isDuplicate(hb: HeartbeatInput): boolean {
  if (hb.is_write) return false; // Writes always accepted
  const db = getDb();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
  const row = db.prepare(`
    SELECT 1 FROM productivity_heartbeats
    WHERE entity = ? AND machine_id = ? AND created_at > ?
    LIMIT 1
  `).get(hb.entity, hb.machine_id || null, twoMinAgo);
  return !!row;
}

// ── Stats Queries ──

function getHeartbeatsForDateRange(start: string, end: string, source?: string): HeartbeatRow[] {
  const db = getDb();
  let query = `SELECT * FROM productivity_heartbeats WHERE created_at >= ? AND created_at < ?`;
  const params: any[] = [start, end];
  if (source && source !== 'all') {
    query += ` AND source = ?`;
    params.push(source);
  }
  query += ` ORDER BY created_at ASC`;
  return db.prepare(query).all(...params) as HeartbeatRow[];
}

function computeBreakdown(heartbeats: HeartbeatRow[], field: keyof HeartbeatRow): { [key: string]: number } {
  // Group heartbeats by field value, compute time per group
  const groups: Record<string, HeartbeatRow[]> = {};
  for (const hb of heartbeats) {
    const key = (hb[field] as string) || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(hb);
  }
  const result: Record<string, number> = {};
  for (const [key, group] of Object.entries(groups)) {
    result[key] = calculateCodingTime(group);
  }
  return result;
}

export function getStatsForDate(dateStr: string, source?: string): DayStats {
  const start = `${dateStr} 00:00:00`;
  const end = `${dateStr} 23:59:59`;
  const heartbeats = getHeartbeatsForDateRange(start, end, source);

  const totalSeconds = calculateCodingTime(heartbeats);
  const sourceBreakdown = computeBreakdown(heartbeats, 'source');
  const projectBreakdown = computeBreakdown(heartbeats, 'project');
  const languageBreakdown = computeBreakdown(heartbeats, 'language');
  const categoryBreakdown = computeBreakdown(heartbeats, 'category');
  const editorBreakdown = computeBreakdown(heartbeats, 'editor');

  return {
    totalSeconds,
    bySource: Object.entries(sourceBreakdown).map(([source, totalSeconds]) => ({ source, totalSeconds })),
    byProject: Object.entries(projectBreakdown)
      .map(([project, totalSeconds]) => ({ project, totalSeconds }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds),
    byLanguage: Object.entries(languageBreakdown)
      .filter(([lang]) => lang !== 'unknown')
      .map(([language, totalSeconds]) => ({ language, totalSeconds }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds),
    byCategory: Object.entries(categoryBreakdown)
      .filter(([cat]) => cat !== 'unknown')
      .map(([category, totalSeconds]) => ({ category, totalSeconds }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds),
    byEditor: Object.entries(editorBreakdown)
      .filter(([ed]) => ed !== 'unknown')
      .map(([editor, totalSeconds]) => ({ editor, totalSeconds }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds),
    heartbeatCount: heartbeats.length,
  };
}

export function getDailyTotals(days: number, source?: string): DailyTotal[] {
  const results: DailyTotal[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;

    const allHeartbeats = getHeartbeatsForDateRange(start, end);
    const editorHbs = allHeartbeats.filter(h => h.source === 'editor');
    const wpHbs = allHeartbeats.filter(h => h.source === 'wordpress');

    results.push({
      date: dateStr,
      totalSeconds: calculateCodingTime(allHeartbeats),
      editorSeconds: calculateCodingTime(editorHbs),
      wordpressSeconds: calculateCodingTime(wpHbs),
    });
  }
  return results;
}

export function getProjectBreakdown(start: string, end: string, source?: string): { project: string; totalSeconds: number }[] {
  const heartbeats = getHeartbeatsForDateRange(start, end, source);
  const breakdown = computeBreakdown(heartbeats, 'project');
  return Object.entries(breakdown)
    .map(([project, totalSeconds]) => ({ project, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

export function getLanguageBreakdown(start: string, end: string): { language: string; totalSeconds: number }[] {
  const heartbeats = getHeartbeatsForDateRange(start, end, 'editor');
  const breakdown = computeBreakdown(heartbeats, 'language');
  return Object.entries(breakdown)
    .filter(([lang]) => lang !== 'unknown')
    .map(([language, totalSeconds]) => ({ language, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

export function getCategoryBreakdown(start: string, end: string): { category: string; totalSeconds: number }[] {
  const heartbeats = getHeartbeatsForDateRange(start, end, 'wordpress');
  const breakdown = computeBreakdown(heartbeats, 'category');
  return Object.entries(breakdown)
    .filter(([cat]) => cat !== 'unknown')
    .map(([category, totalSeconds]) => ({ category, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

export function getSourceBreakdown(start: string, end: string): { source: string; totalSeconds: number }[] {
  const heartbeats = getHeartbeatsForDateRange(start, end);
  const breakdown = computeBreakdown(heartbeats, 'source');
  return Object.entries(breakdown)
    .map(([source, totalSeconds]) => ({ source, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

export function getSessionsForDate(dateStr: string, source?: string): SessionInfo[] {
  const start = `${dateStr} 00:00:00`;
  const end = `${dateStr} 23:59:59`;
  const heartbeats = getHeartbeatsForDateRange(start, end, source);
  return calculateSessions(heartbeats);
}

// ── Extended Stats ──

export function getHourlyActivity(dateStr: string, source?: string): { hour: number; totalSeconds: number }[] {
  const start = `${dateStr} 00:00:00`;
  const end = `${dateStr} 23:59:59`;
  const heartbeats = getHeartbeatsForDateRange(start, end, source);

  // Group heartbeats by hour
  const hourGroups: Record<number, HeartbeatRow[]> = {};
  for (let h = 0; h < 24; h++) hourGroups[h] = [];
  for (const hb of heartbeats) {
    const hour = new Date(hb.created_at + 'Z').getHours();
    hourGroups[hour].push(hb);
  }

  return Object.entries(hourGroups).map(([h, hbs]) => ({
    hour: parseInt(h),
    totalSeconds: calculateCodingTime(hbs),
  }));
}

export function getWeekdayActivity(days: number, source?: string): { day: string; totalSeconds: number; avgSeconds: number }[] {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayTotals: Record<number, number[]> = {};
  for (let d = 0; d < 7; d++) dayTotals[d] = [];

  const now = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;
    const heartbeats = getHeartbeatsForDateRange(start, end, source);
    const seconds = calculateCodingTime(heartbeats);
    dayTotals[date.getDay()].push(seconds);
  }

  return dayNames.map((day, i) => {
    const totals = dayTotals[i];
    const sum = totals.reduce((a, b) => a + b, 0);
    return {
      day,
      totalSeconds: sum,
      avgSeconds: totals.length > 0 ? Math.round(sum / totals.length) : 0,
    };
  });
}

export function getScreenBreakdown(start: string, end: string): { screen: string; totalSeconds: number; count: number }[] {
  const heartbeats = getHeartbeatsForDateRange(start, end, 'wordpress');
  const groups: Record<string, HeartbeatRow[]> = {};
  for (const hb of heartbeats) {
    const screen = hb.entity || 'unknown';
    if (!groups[screen]) groups[screen] = [];
    groups[screen].push(hb);
  }
  return Object.entries(groups)
    .map(([screen, hbs]) => ({
      screen: formatScreenName(screen),
      totalSeconds: calculateCodingTime(hbs),
      count: hbs.length,
    }))
    .filter(s => s.totalSeconds > 0)
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

function formatScreenName(screen: string): string {
  const names: Record<string, string> = {
    'dashboard': 'Dashboard',
    'edit-post': 'Posts List',
    'post': 'Post Editor',
    'edit-page': 'Pages List',
    'page': 'Page Editor',
    'upload': 'Media Library',
    'media': 'Media Editor',
    'edit-post_tag': 'Tags',
    'edit-category': 'Categories',
    'plugins': 'Plugins',
    'plugin-install': 'Add Plugins',
    'themes': 'Themes',
    'theme-install': 'Add Themes',
    'customize': 'Customizer',
    'site-editor': 'Site Editor',
    'options-general': 'General Settings',
    'options-writing': 'Writing Settings',
    'options-reading': 'Reading Settings',
    'options-discussion': 'Discussion Settings',
    'options-media': 'Media Settings',
    'options-permalink': 'Permalink Settings',
    'tools': 'Tools',
    'users': 'Users',
    'profile': 'Profile',
  };
  return names[screen] || screen.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getWriteEvents(start: string, end: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) as c FROM productivity_heartbeats WHERE created_at >= ? AND created_at < ? AND is_write = 1'
  ).get(start, end) as { c: number };
  return row.c;
}

export function getSitesWithPluginInfo(): { subdomain: string; totalSeconds: number; pluginCount: number; status: string }[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const start = `${today} 00:00:00`;
  const end = `${today} 23:59:59`;
  const heartbeats = getHeartbeatsForDateRange(start, end, 'wordpress');
  const breakdown = computeBreakdown(heartbeats, 'project');

  // Get site info from sites table
  const sites = db.prepare(
    "SELECT subdomain, status FROM sites WHERE status = 'running'"
  ).all() as { subdomain: string; status: string }[];
  const siteMap = new Map(sites.map(s => [s.subdomain, s]));

  return Object.entries(breakdown)
    .map(([subdomain, totalSeconds]) => ({
      subdomain,
      totalSeconds,
      pluginCount: 0, // Would need Docker exec to get, skip for now
      status: siteMap.get(subdomain)?.status || 'unknown',
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

export function getSummaryStats(dateStr: string, days: number, source?: string) {
  const start = `${dateStr} 00:00:00`;
  const end = `${dateStr} 23:59:59`;
  const heartbeats = getHeartbeatsForDateRange(start, end, source);

  const totalSeconds = calculateCodingTime(heartbeats);
  const writeCount = heartbeats.filter(h => h.is_write).length;

  // Best day in the range
  let bestDay = { date: '', seconds: 0 };
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const dayHbs = getHeartbeatsForDateRange(`${ds} 00:00:00`, `${ds} 23:59:59`, source);
    const daySec = calculateCodingTime(dayHbs);
    if (daySec > bestDay.seconds) {
      bestDay = { date: ds, seconds: daySec };
    }
  }

  return {
    totalSeconds,
    heartbeatCount: heartbeats.length,
    writeCount,
    bestDay,
  };
}

// ── Goals ──

export function getGoal(): { dailyGoalSeconds: number } {
  const db = getDb();
  const row = db.prepare("SELECT daily_goal_seconds FROM productivity_goals WHERE id = 'default'").get() as { daily_goal_seconds: number } | undefined;
  return { dailyGoalSeconds: row?.daily_goal_seconds ?? 21600 };
}

export function setGoal(seconds: number): void {
  if (seconds < 60 || seconds > 86400) throw new Error('Goal must be between 1 minute and 24 hours');
  const db = getDb();
  db.prepare(`
    INSERT INTO productivity_goals (id, daily_goal_seconds, updated_at) VALUES ('default', ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET daily_goal_seconds = ?, updated_at = datetime('now')
  `).run(seconds, seconds);
}

// ── Streak ──

export function getCurrentStreak(): number {
  const STREAK_THRESHOLD = 30 * 60; // 30 minutes minimum to count a day
  let streak = 0;
  const now = new Date();

  for (let i = 0; i < 365; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;
    const heartbeats = getHeartbeatsForDateRange(start, end);
    const seconds = calculateCodingTime(heartbeats);

    if (seconds >= STREAK_THRESHOLD) {
      streak++;
    } else if (i > 0) {
      // Skip today (i===0) since the day isn't over yet
      break;
    }
  }
  return streak;
}

// ── Data Management ──

export function clearOldData(olderThanDays: number): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').replace('Z', '');
  const result = db.prepare('DELETE FROM productivity_heartbeats WHERE created_at < ?').run(cutoff);
  return result.changes;
}

export function clearAllData(): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM productivity_heartbeats').run();
  db.prepare("DELETE FROM productivity_goals").run();
  db.prepare("DELETE FROM productivity_sync_log").run();
  return result.changes;
}

// ── Cloud Config ──

export function getCloudConfig(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM productivity_cloud_config').all() as { key: string; value: string }[];
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

export function setCloudConfig(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO productivity_cloud_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?
  `).run(key, value, value);
}

export function deleteCloudConfig(): void {
  const db = getDb();
  db.prepare('DELETE FROM productivity_cloud_config').run();
}

// ── Sync helpers ──

export function getUnsyncedHeartbeats(limit: number): HeartbeatRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM productivity_heartbeats WHERE synced = 0 ORDER BY created_at ASC LIMIT ?'
  ).all(limit) as HeartbeatRow[];
}

export function markHeartbeatsSynced(ids: number[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE productivity_heartbeats SET synced = 1 WHERE id IN (${placeholders})`).run(...ids);
}

export function addSyncLog(count: number, status: string, error?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO productivity_sync_log (heartbeats_count, status, error, completed_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(count, status, error || null);
}

export function getSyncLogs(limit: number = 20): any[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM productivity_sync_log ORDER BY started_at DESC LIMIT ?'
  ).all(limit);
}
