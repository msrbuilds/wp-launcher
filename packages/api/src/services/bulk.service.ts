import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { createSite, CreateSiteRequest } from './site.service';
import { ValidationError, NotFoundError } from '../utils/errors';

export interface BulkJobConfig {
  productId: string;
  count: number;
  expiresIn?: string;
  subdomainPrefix?: string;
  adminUser?: string;
  adminEmail?: string;
}

export interface BulkJobRecord {
  id: string;
  product_id: string;
  total: number;
  completed: number;
  failed: number;
  status: string;
  config: string;
  results: string | null;
  created_at: string;
  completed_at: string | null;
  user_id: string | null;
}

interface SiteResult {
  index: number;
  siteId?: string;
  subdomain?: string;
  url?: string;
  adminUrl?: string;
  username?: string;
  password?: string;
  error?: string;
}

// In-memory cancellation signals
const activeJobs = new Map<string, { cancelled: boolean }>();

export function startBulkJob(cfg: BulkJobConfig, userId?: string): string {
  if (cfg.count < 1 || cfg.count > 50) {
    throw new ValidationError('Count must be between 1 and 50');
  }

  const db = getDb();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO bulk_jobs (id, product_id, total, status, config, results, user_id)
    VALUES (?, ?, ?, 'running', ?, '[]', ?)
  `).run(id, cfg.productId, cfg.count, JSON.stringify(cfg), userId || null);

  const signal = { cancelled: false };
  activeJobs.set(id, signal);

  // Fire-and-forget async loop
  runBulkJob(id, cfg, signal).catch((err) => {
    console.error(`[bulk] Job ${id} fatal error:`, err);
    db.prepare(`UPDATE bulk_jobs SET status = 'failed', completed_at = datetime('now') WHERE id = ?`).run(id);
  }).finally(() => {
    activeJobs.delete(id);
  });

  return id;
}

async function runBulkJob(jobId: string, cfg: BulkJobConfig, signal: { cancelled: boolean }): Promise<void> {
  const db = getDb();
  const results: SiteResult[] = [];

  for (let i = 0; i < cfg.count; i++) {
    if (signal.cancelled) {
      db.prepare(`UPDATE bulk_jobs SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?`).run(jobId);
      return;
    }

    const index = i + 1;
    const req: CreateSiteRequest = {
      productId: cfg.productId,
      expiresIn: cfg.expiresIn,
      userId: 'admin',
      userEmail: 'admin@localhost',
      adminUser: cfg.adminUser,
      adminEmail: cfg.adminEmail,
    };

    // Custom subdomain with prefix
    if (cfg.subdomainPrefix) {
      req.subdomain = `${cfg.subdomainPrefix}-${String(index).padStart(3, '0')}`;
    }

    try {
      const site = await createSite(req);
      results.push({
        index,
        siteId: site.id,
        subdomain: site.subdomain,
        url: site.site_url || undefined,
        adminUrl: site.admin_url || undefined,
        username: site.admin_user || undefined,
        password: site.oneTimePassword,
      });

      db.prepare(`
        UPDATE bulk_jobs SET completed = ?, results = ? WHERE id = ?
      `).run(i + 1, JSON.stringify(results), jobId);
    } catch (err: any) {
      results.push({ index, error: err.message || 'Unknown error' });

      db.prepare(`
        UPDATE bulk_jobs SET completed = ?, failed = failed + 1, results = ? WHERE id = ?
      `).run(i + 1, JSON.stringify(results), jobId);
    }

    // Small delay between creations to avoid overwhelming Docker
    if (i < cfg.count - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  db.prepare(`UPDATE bulk_jobs SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(jobId);
}

export function getBulkJob(id: string): BulkJobRecord {
  const db = getDb();
  const job = db.prepare('SELECT * FROM bulk_jobs WHERE id = ?').get(id) as BulkJobRecord | undefined;
  if (!job) throw new NotFoundError('Bulk job not found');
  return job;
}

export function listBulkJobs(limit = 20, offset = 0): { data: BulkJobRecord[]; total: number } {
  const db = getDb();
  const data = db.prepare('SELECT * FROM bulk_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as BulkJobRecord[];
  const total = (db.prepare('SELECT COUNT(*) as count FROM bulk_jobs').get() as { count: number }).count;
  return { data, total };
}

export function cancelBulkJob(id: string): void {
  const signal = activeJobs.get(id);
  if (signal) {
    signal.cancelled = true;
  } else {
    // Job may have already finished — just mark as cancelled if still running
    const db = getDb();
    db.prepare(`UPDATE bulk_jobs SET status = 'cancelled', completed_at = datetime('now') WHERE id = ? AND status = 'running'`).run(id);
  }
}

export function exportBulkJobCsv(id: string): string {
  const job = getBulkJob(id);
  const results: SiteResult[] = JSON.parse(job.results || '[]');

  const lines = ['subdomain,url,admin_url,username,password,error'];
  for (const r of results) {
    lines.push([
      r.subdomain || '',
      r.url || '',
      r.adminUrl || '',
      r.username || '',
      r.password || '',
      r.error || '',
    ].map((v) => `"${v.replace(/"/g, '""')}"`).join(','));
  }

  return lines.join('\n');
}
