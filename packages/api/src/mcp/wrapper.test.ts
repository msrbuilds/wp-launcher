import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { AppError } from '../utils/errors';
import { defineTool } from './registry';
import { NOT_AVAILABLE_MESSAGE, toSdkTool } from './wrapper';
import { __resetLimitsForTesting } from './limits';
import type { McpAuthContext } from '../oauth/token.service';

let db: Database.Database;
beforeEach(() => { db = createTestDb(); __setDbForTesting(db); __resetLimitsForTesting(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { __setDbForTesting(null); db.close(); vi.restoreAllMocks(); });

const ctx = (scopes: McpAuthContext['scopes'] = ['sites:read']): McpAuthContext => ({
  userId: 'u1', userEmail: 'u1@x.test', userRole: 'owner', grantId: 'g1', clientId: 'c1', clientName: 'App', scopes,
});

function makeTool(handler: (...args: any[]) => unknown, over: Record<string, unknown> = {}) {
  return defineTool({
    name: 'probe', title: 'Probe', description: 'd', scope: 'sites:read', annotations: { readOnlyHint: true },
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), nested: z.object({ ok: z.number() }).optional() }),
    handler: handler as never, ...over,
  });
}

function auditRows() {
  return db.prepare('SELECT * FROM mcp_audit_log').all() as Record<string, unknown>[];
}

describe('toSdkTool', () => {
  it('asks the SDK to challenge for the tool scope', () => {
    expect(toSdkTool(makeTool(() => ({})), ctx()).requiredScope).toBe('sites:read');
  });

  it('backstop: a missing scope never runs the handler, and is audited as a bypass', async () => {
    const handler = vi.fn();
    const result = await toSdkTool(makeTool(handler, { scope: 'sites:write' }), ctx(['sites:read'])).run({ id: 'x' });
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(NOT_AVAILABLE_MESSAGE);
    expect(auditRows()).toMatchObject([{ outcome: 'denied', bypass: 1, tool: 'probe' }]);
  });

  it('backstop: an ineligible tool never runs the handler', async () => {
    const handler = vi.fn();
    const result = await toSdkTool(makeTool(handler, { feature: 'cloning' }), ctx()).run({ id: 'x' });
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it('allowlists output: unknown keys, even nested ones, never leave the server', async () => {
    const run = toSdkTool(makeTool(() => ({ id: 's1', admin_password: 'SECRET-PW', nested: { auto_login_token: 'SECRET-TOK', ok: 1 } })), ctx()).run;
    const result = await run({ id: 's1' });
    expect(result.structuredContent).toEqual({ id: 's1', nested: { ok: 1 } });
    expect(JSON.stringify(result)).not.toMatch(/SECRET-PW|SECRET-TOK/);
    expect(auditRows()).toMatchObject([{ outcome: 'ok', bypass: 0 }]);
  });

  it('turns an AppError into an isError result carrying its details', async () => {
    const result = await toSdkTool(makeTool(() => { throw new AppError('Image missing', 409, { code: 'IMAGE_NOT_BUILT', rebuildable: true }); }), ctx()).run({ id: 'x' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: 'Image missing', code: 'IMAGE_NOT_BUILT', rebuildable: true });
    expect(auditRows()).toMatchObject([{ outcome: 'error', error: 'Image missing' }]);
  });

  it('hides unexpected errors behind a generic message', async () => {
    const result = await toSdkTool(makeTool(() => { throw new Error('db exploded at /secret/path'); }), ctx()).run({ id: 'x' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('/secret/path');
  });

  it('refuses invalid input without running the handler', async () => {
    const handler = vi.fn();
    const result = await toSdkTool(makeTool(handler), ctx()).run({ id: 42 });
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it('stops writes once the bucket is spent', async () => {
    const handler = vi.fn(() => ({ id: 'x' }));
    const run = toSdkTool(makeTool(handler, { writeBucket: 'sites' }), ctx()).run;
    for (let i = 0; i < 10; i++) expect((await run({ id: 'x' })).isError).toBeFalsy();
    const eleventh = await run({ id: 'x' });
    expect(eleventh.isError).toBe(true);
    expect(eleventh.content[0].text).toMatch(/rate limit/i);
    expect(handler).toHaveBeenCalledTimes(10);
  });
});
