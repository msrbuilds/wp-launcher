/**
 * The only module that imports the MCP SDK. Everything else in the API talks
 * to these few functions, so an SDK upgrade (v2 is young) touches one file and
 * reruns the Stage 1 acceptance suite, rather than rippling through every tool.
 */
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';

export type { AuthInfo };

export const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18'] as const;

export interface SdkToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface SdkToolSpec {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  outputSchema: z.ZodObject<any>;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  /**
   * When set, a call whose token lacks this scope is answered by the SDK with
   * HTTP 403 + `WWW-Authenticate: Bearer error="insufficient_scope"` before the
   * tool runs, in both protocol eras.
   */
  requiredScope?: string;
  run(args: unknown): Promise<SdkToolResult>;
}

/**
 * Fails closed: a request that somehow reached the SDK without auth info is
 * challenged exactly like one whose token lacks the scope. The bearer guard
 * should make that impossible, which is why it must not be relied on here.
 */
export function scopeChallengeFor(scope: string) {
  return ({ authInfo }: { authInfo?: AuthInfo }): { scopes: [string, ...string[]] } | undefined => {
    const held = authInfo && Array.isArray(authInfo.scopes) ? authInfo.scopes : [];
    if (held.includes(scope)) return undefined;
    // Ask for everything already held plus the missing scope: clients re-authorise
    // with exactly the challenged set, so a challenge naming only the new scope
    // would make step-up *replace* the grant and drop the scopes it had.
    const scopes = [...held, scope];
    return { scopes: scopes as unknown as [string, ...string[]] };
  };
}

export function buildMcpServer(info: { name: string; version: string }, tools: SdkToolSpec[]): McpServer {
  const server = new McpServer(info, {
    capabilities: { tools: {} },
    supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
  });
  for (const tool of tools) {
    const scope = tool.requiredScope;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        // Passed as the input schema itself (Standard Schema); the SDK
        // validates arguments against it before `run` is called.
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
        scopeChallenge: scope ? scopeChallengeFor(scope) : undefined,
      },
      async (args: unknown) => tool.run(args) as any,
    );
  }
  return server;
}

/**
 * Express handler serving both protocol eras: 2026-07-28 per-request envelopes
 * and 2025-era `initialize` traffic through the stateless legacy fallback (no
 * `Mcp-Session-Id`, so an API restart strands nobody). `req.auth`, set by the
 * bearer guard, is forwarded to the factory as `authInfo`.
 */
export function createRequestHandler(factory: (authInfo: AuthInfo | undefined) => McpServer): RequestHandler {
  const handler = createMcpHandler((ctx) => factory(ctx.authInfo), { legacy: 'stateless', responseMode: 'json' });
  const node = toNodeHandler(handler, { onerror: (err) => console.error('[mcp] handler error:', err.message) });
  return (req, res) => {
    void node(req as any, res as any, req.body);
  };
}
