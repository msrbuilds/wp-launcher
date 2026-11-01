import type { IncomingHttpHeaders } from 'http';
import { SUPPORTED_PROTOCOL_VERSIONS } from './sdk';

/**
 * Step 3 of the request pipeline. Everything this application requires of the
 * protocol envelope is checked here and *answered here*: an invalid request is
 * never forwarded on the assumption that the SDK will reject it (its legacy
 * path, for one, accepts a missing MCP-Protocol-Version header).
 */

export type Envelope =
  | { ok: true; era: '2026' | '2025'; version: string; kind: 'request' | 'notification'; method: string; id?: string | number; toolName?: string }
  | { ok: false; status: 400 | 405; body: object };

const MODERN = '2026-07-28';
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18'];

const UNSUPPORTED_VERSION = -32022;
const HEADER_MISMATCH = -32020;
const INVALID_REQUEST = -32600;

function rpcError(status: 400 | 405, code: number, message: string, data?: unknown, id: string | number | null = null): Envelope {
  return { ok: false, status, body: { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } } };
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** RFC-style `=?base64?…?=` sentinel used for header values that are not plain ASCII. */
function decodeHeaderValue(value: string): string {
  const m = value.match(/^=\?base64\?(.*)\?=$/);
  return m ? Buffer.from(m[1], 'base64').toString('utf8') : value;
}

export function validateEnvelope(req: { method: string; headers: IncomingHttpHeaders; body: unknown }): Envelope {
  if (req.method !== 'POST') {
    return rpcError(405, INVALID_REQUEST, 'Method not allowed.');
  }
  const body = req.body;
  if (Array.isArray(body)) return rpcError(400, INVALID_REQUEST, 'Batch requests are not supported.');
  if (!body || typeof body !== 'object' || (body as Record<string, unknown>).jsonrpc !== '2.0') {
    return rpcError(400, INVALID_REQUEST, 'The body must be a single JSON-RPC 2.0 message.');
  }
  const msg = body as Record<string, unknown>;
  if ('result' in msg || 'error' in msg) return rpcError(400, INVALID_REQUEST, 'This server never sends requests, so it accepts no responses.');
  if (typeof msg.method !== 'string') return rpcError(400, INVALID_REQUEST, 'Missing method.');
  const method = msg.method;
  const hasId = 'id' in msg && (typeof msg.id === 'string' || typeof msg.id === 'number');
  const id = hasId ? (msg.id as string | number) : undefined;
  const kind = hasId ? 'request' : 'notification';
  const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;
  const toolName = method === 'tools/call' && typeof params.name === 'string' ? params.name : undefined;

  const version = header(req.headers, 'mcp-protocol-version');

  if (version === undefined) {
    // In the 2025 spec the header is required only *after* initialisation.
    if (method === 'initialize' && kind === 'request') {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      // An unsupported ask is passed on for the SDK to counter-offer a version
      // it supports; it is never treated as 2025-03-26.
      return { ok: true, era: '2025', version: LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0], kind, method, id };
    }
    return rpcError(400, INVALID_REQUEST, 'Missing MCP-Protocol-Version header.', undefined, id ?? null);
  }

  if (!(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return rpcError(400, UNSUPPORTED_VERSION, `Unsupported protocol version: ${version}`, { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested: version }, id ?? null);
  }

  if (version === MODERN) {
    if (kind === 'notification') return rpcError(400, INVALID_REQUEST, 'This protocol revision defines no client notifications over HTTP.');
    const mcpMethod = header(req.headers, 'mcp-method');
    if (mcpMethod !== method) return rpcError(400, HEADER_MISMATCH, 'Mcp-Method header is missing or does not match the body.', undefined, id ?? null);
    if (method === 'tools/call') {
      const mcpName = header(req.headers, 'mcp-name');
      if (mcpName === undefined || decodeHeaderValue(mcpName) !== toolName) {
        return rpcError(400, HEADER_MISMATCH, 'Mcp-Name header is missing or does not match the body.', undefined, id ?? null);
      }
    }
    return { ok: true, era: '2026', version, kind, method, id, toolName };
  }

  return { ok: true, era: '2025', version, kind, method, id, toolName };
}
