import type { z } from 'zod';
import { isAdminRole, isFeatureEnabled } from '../services/features.service';
import { ROLE_RANK } from '../middleware/requireRole';
import type { McpAuthContext } from '../oauth/token.service';
import type { Scope } from '../oauth/scopes';

export interface ToolDef<I extends z.ZodObject<any> = z.ZodObject<any>, O extends z.ZodObject<any> = z.ZodObject<any>> {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  /** Resolved with isFeatureEnabled(feature, role): tools follow what the panel UI offers. */
  feature?: string;
  minRole?: 'admin' | 'owner';
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  writeBucket?: 'sites' | 'crm' | 'admin';
  input: I;
  /** Plain z.object only (never passthrough/loose): parsing it is the output allowlist. */
  output: O;
  handler(args: z.infer<I>, ctx: McpAuthContext): unknown | Promise<unknown>;
}

export function defineTool<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def;
}

const registry = new Map<string, ToolDef>();

export function registerTools(defs: ToolDef[]): void {
  for (const def of defs) {
    if (registry.has(def.name)) throw new Error(`Duplicate MCP tool name: ${def.name}`);
    registry.set(def.name, def);
  }
}

export function allTools(): ToolDef[] {
  return [...registry.values()];
}

export function getTool(name: string): ToolDef | undefined {
  return registry.get(name);
}

/**
 * Whether this user could ever use the tool: role and feature flags only. A
 * tool merely outside the grant's scopes is still eligible — it is listed, and
 * calling it produces a scope challenge (step-up), not silence.
 */
export function isEligible(tool: ToolDef, ctx: Pick<McpAuthContext, 'userRole'>): boolean {
  if (!isAdminRole(ctx.userRole)) return false;
  if ((ROLE_RANK[ctx.userRole] ?? 0) < ROLE_RANK[tool.minRole ?? 'admin']) return false;
  if (tool.feature && !isFeatureEnabled(tool.feature, ctx.userRole)) return false;
  return true;
}

export function __resetRegistryForTesting(): void {
  registry.clear();
}
