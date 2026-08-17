import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';

// Mock the provisioner client so the runner never touches real Docker.
vi.mock('./docker.service', () => ({
  buildImageStream: vi.fn(async (_tar: unknown, _tag: string, _args: unknown, onLine: (l: string) => void) => {
    onLine('Step 1/1 : FROM base');
  }),
  tagImage: vi.fn(async () => {}),
}));

import {
  createBuildJob, getBuildJob, listBuildJobs, appendLog, finishJob, reconcileStuckImageBuilds, runBuildJob,
} from './imageBuildJob.service';

let db: Database.Database;
let ctxDir: string;
beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  // A real build context. The runner refuses to stream an empty one, so tests
  // that expect a build to proceed need a Dockerfile actually on disk.
  ctxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-ctx-'));
  fs.writeFileSync(path.join(ctxDir, 'Dockerfile'), 'FROM scratch\n');
});
afterEach(() => {
  __setDbForTesting(null);
  db.close();
  fs.rmSync(ctxDir, { recursive: true, force: true });
});

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

  it('runs a base build to success and logs output', async () => {
    const job = createBuildJob({
      tag: 'wp-launcher/wordpress:php8.3', kind: 'base', createdBy: 'u1',
      spec: { phpVersion: '8.3', wpVersion: '6.9' },
    });
    await runBuildJob(job.id, ctxDir);
    const done = getBuildJob(job.id)!;
    expect(done.status).toBe('success');
    expect(done.log).toContain('Step 1/1');
  });

  it('marks failure when the build stream throws', async () => {
    const mod = await import('./docker.service');
    (mod.buildImageStream as any).mockRejectedValueOnce(new Error('manifest unknown'));
    const job = createBuildJob({
      tag: 'wp-launcher/wordpress:php8.5-wp6.7', kind: 'base', createdBy: 'u1',
      spec: { phpVersion: '8.5', wpVersion: '6.7' },
    });
    await runBuildJob(job.id, ctxDir);
    const done = getBuildJob(job.id)!;
    expect(done.status).toBe('failed');
    expect(done.error).toContain('manifest unknown');
  });

  it('names the real problem when the build context is empty', async () => {
    // Dokploy wipes and re-clones code/ on redeploy, so a container that keeps
    // running holds a bind mount to the deleted inode and sees an empty
    // directory. Streaming that produced "Cannot locate specified Dockerfile"
    // from Docker, which sends you looking for a missing file rather than a
    // stale mount.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-empty-'));
    try {
      const job = createBuildJob({
        tag: 'wp-launcher/wordpress:php8.4-wp7.0', kind: 'base', createdBy: 'u1',
        spec: { phpVersion: '8.4', wpVersion: '7.0' },
      });
      await runBuildJob(job.id, empty);
      const done = getBuildJob(job.id)!;
      expect(done.status).toBe('failed');
      expect(done.error).toContain(empty);
      expect(done.error).toMatch(/no Dockerfile/i);
      expect(done.error).toMatch(/restart/i);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('re-points :latest after building the default pair', async () => {
    // Every install's WP_IMAGE defaults to :latest, and only build-wp-image.sh
    // ever applied it. Without this, a rebuild from the panel reports success
    // while every launch keeps failing on the tag just rebuilt.
    const mod = await import('./docker.service');
    (mod.tagImage as any).mockClear();
    const job = createBuildJob({
      tag: 'wp-launcher/wordpress:php8.3', kind: 'base', createdBy: 'u1',
      spec: { phpVersion: '8.3', wpVersion: '6.9' },
    });
    await runBuildJob(job.id, ctxDir);
    expect(getBuildJob(job.id)!.status).toBe('success');
    expect(mod.tagImage).toHaveBeenCalledWith(
      'wp-launcher/wordpress:php8.3', 'wp-launcher/wordpress:latest',
    );
  });

  it('leaves :latest alone for a non-default pair', async () => {
    const mod = await import('./docker.service');
    (mod.tagImage as any).mockClear();
    const job = createBuildJob({
      tag: 'wp-launcher/wordpress:php8.5-wp6.7', kind: 'base', createdBy: 'u1',
      spec: { phpVersion: '8.5', wpVersion: '6.7' },
    });
    await runBuildJob(job.id, ctxDir);
    expect(mod.tagImage).not.toHaveBeenCalled();
  });

  it('still reports success when only the :latest alias fails', async () => {
    // The image itself built. Failing the job would send the operator hunting a
    // build error that did not happen.
    const mod = await import('./docker.service');
    (mod.tagImage as any).mockClear();
    (mod.tagImage as any).mockRejectedValueOnce(new Error('daemon busy'));
    const job = createBuildJob({
      tag: 'wp-launcher/wordpress:php8.3', kind: 'base', createdBy: 'u1',
      spec: { phpVersion: '8.3', wpVersion: '6.9' },
    });
    await runBuildJob(job.id, ctxDir);
    const done = getBuildJob(job.id)!;
    expect(done.status).toBe('success');
    expect(done.log).toMatch(/daemon busy/);
  });
});
