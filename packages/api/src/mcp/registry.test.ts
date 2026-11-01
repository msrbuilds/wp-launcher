import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { __resetRegistryForTesting, allTools, defineTool, getTool, isEligible, registerTools } from './registry';

let db: Database.Database;
beforeEach(() => { db = createTestDb(); __setDbForTesting(db); __resetRegistryForTesting(); });
afterEach(() => { __setDbForTesting(null); db.close(); __resetRegistryForTesting(); });

const tool = (over: Partial<Parameters<typeof defineTool>[0]> = {}) => defineTool({
  name: 't', title: 'T', description: 'd', scope: 'sites:read', annotations: { readOnlyHint: true },
  input: z.object({}), output: z.object({}), handler: () => ({}), ...over,
});

describe('registry', () => {
  it('registers and looks tools up by name', () => {
    registerTools([tool({ name: 'a' }), tool({ name: 'b' })]);
    expect(allTools().map((t) => t.name)).toEqual(['a', 'b']);
    expect(getTool('b')?.name).toBe('b');
    expect(getTool('zzz')).toBeUndefined();
  });

  it('refuses a duplicate name', () => {
    registerTools([tool({ name: 'a' })]);
    expect(() => registerTools([tool({ name: 'a' })])).toThrow(/duplicate/i);
  });
});

describe('isEligible', () => {
  it('needs the feature on for the caller role', () => {
    const t = tool({ feature: 'cloning' });
    expect(isEligible(t, { userRole: 'admin' })).toBe(false);
    db.prepare("INSERT INTO settings (key, value) VALUES ('feature.cloning', 'true')").run();
    expect(isEligible(t, { userRole: 'admin' })).toBe(true);
  });

  it('honours minRole', () => {
    const t = tool({ minRole: 'owner' });
    expect(isEligible(t, { userRole: 'admin' })).toBe(false);
    expect(isEligible(t, { userRole: 'owner' })).toBe(true);
  });

  it('never makes a tool eligible for a non-staff role', () => {
    expect(isEligible(tool(), { userRole: 'member' as never })).toBe(false);
  });
});
