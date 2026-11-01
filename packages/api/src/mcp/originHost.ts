import type { RequestHandler } from 'express';
import { config } from '../config';
import { isLocalDeployment } from '../utils/deployment';
import { issuer } from '../oauth/urls';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Origins trusted to call /api/mcp from a browser: the panel itself plus MCP_ALLOWED_ORIGINS. Never a demo site. */
export function allowedMcpOrigins(publicUrl = config.publicUrl, extra = config.mcpAllowedOrigins): Set<string> {
  const set = new Set<string>([issuer(publicUrl)]);
  for (const o of extra) {
    const n = normalizeOrigin(o);
    if (n) set.add(n);
  }
  return set;
}

function hostnameOf(host: string): string {
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
}

/**
 * Step 1 of the pipeline, before authentication. CORS only decides what a
 * browser may *read*; this decides what reaches the server. An absent Origin
 * is allowed (server-side agents send none); a present, untrusted one is 403.
 * Host is checked against the panel's own names to defeat DNS rebinding, which
 * matters most on a local install.
 */
export function originHostGuard(opts: { publicUrl?: string; baseDomain?: string; allowed?: string[]; isLocal?: boolean } = {}): RequestHandler {
  return (req, res, next) => {
    const publicUrl = opts.publicUrl ?? config.publicUrl;
    const baseDomain = opts.baseDomain ?? config.baseDomain;
    const isLocal = opts.isLocal ?? isLocalDeployment();
    const forbid = (message: string) => res.status(403).json({ jsonrpc: '2.0', error: { code: -32600, message } });

    const origin = req.headers.origin;
    if (origin !== undefined && !allowedMcpOrigins(publicUrl, opts.allowed ?? config.mcpAllowedOrigins).has(origin)) {
      forbid('Origin not allowed');
      return;
    }

    const host = (req.headers.host ?? '').toLowerCase();
    const allowedHosts = new Set([new URL(publicUrl).host.toLowerCase(), `api.${baseDomain}`.toLowerCase()]);
    const ok = allowedHosts.has(host) || (isLocal && LOOPBACK.has(hostnameOf(host)));
    if (!ok) {
      forbid('Host not allowed');
      return;
    }
    next();
  };
}
