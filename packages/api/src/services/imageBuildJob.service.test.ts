import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  createBuildJob, getBuildJob, listBuildJobs, appendLog, finishJob, reconcileStuckImageBuilds,
} from './imageBuildJob.service';

let db: Database.Database;
beforeEach(() => { db = createTestDb(); __setDbForTesting(db); });
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('imageBuildJob.service', () => {
  it('creates a queued job and reads it back', () => {
    const job = createBuildJob({ tag: 'wp-launcher/x:latest', kind: 'custom', spec: {}, createdBy: 'u1' });
    expect(job.status).toBe('queued');
    expect(getBuildJob(job.id)?.tag).toBe('wp-launcher/x:latest');
  });

  it('appends log lines and finishes success', () => {
    const job = createBuildJob({ tag: 'wp-launcher/x:latest', kind: 'custom', spec: {}, createdBy: 'u1' });
    appendLog(job.id, 'Step 1/2\n');
    appendLog(job.id, 'Step 2/2\n');
    finishJob(job.id, 'success', null);
    const done = getBuildJob(job.id)!;
    expect(done.status).toBe('success');
    expect(done.log).toContain('Step 1/2');
    expect(done.completed_at).toBeTruthy();
  });

  it('records a failure message', () => {
    const job = createBuildJob({ tag: 'wp-launcher/x:latest', kind: 'base', spec: {}, createdBy: 'u1' });
    finishJob(job.id, 'failed', 'boom');
    expect(getBuildJob(job.id)!.error).toBe('boom');
  });

  it('reconciles stuck jobs on startup', () => {
    const a = createBuildJob({ tag: 'wp-launcher/a:latest', kind: 'base', spec: {}, createdBy: 'u1' });
    db.prepare("UPDATE image_builds SET status='building' WHERE id=?").run(a.id);
    reconcileStuckImageBuilds();
    expect(getBuildJob(a.id)!.status).toBe('failed');
  });

  it('lists newest first', () => {
    createBuildJob({ tag: 'wp-launcher/a:latest', kind: 'base', spec: {}, createdBy: 'u1' });
    createBuildJob({ tag: 'wp-launcher/b:latest', kind: 'base', spec: {}, createdBy: 'u1' });
    expect(listBuildJobs(10).length).toBe(2);
  });
});
