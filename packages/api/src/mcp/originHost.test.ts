import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { originHostGuard } from './originHost';

const opts = { publicUrl: 'https://panel.example.com', baseDomain: 'panel.example.com', allowed: ['http://localhost:6274'], isLocal: false };

function run(headers: Record<string, string>, o: Parameters<typeof originHostGuard>[0] = opts) {
  const res = { statusCode: 200, body: undefined as unknown, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  const next = vi.fn();
  originHostGuard(o)({ headers } as unknown as Request, res as unknown as Response, next);
  return { status: next.mock.calls.length ? 'next' : res.statusCode, body: res.body };
}

describe('originHostGuard: Origin', () => {
  it('allows a request with no Origin (server-side agents send none)', () => {
    expect(run({ host: 'panel.example.com' }).status).toBe('next');
  });
  it('allows the panel origin and configured extra origins', () => {
    expect(run({ host: 'panel.example.com', origin: 'https://panel.example.com' }).status).toBe('next');
    expect(run({ host: 'panel.example.com', origin: 'http://localhost:6274' }).status).toBe('next');
  });
  it('refuses any other origin with 403 and a JSON-RPC error that has no id', () => {
    for (const origin of ['https://evil.example', 'null', 'https://demo-abc.panel.example.com', 'http://panel.example.com']) {
      const r = run({ host: 'panel.example.com', origin });
      expect(r.status, origin).toBe(403);
      expect(r.body).toMatchObject({ jsonrpc: '2.0', error: { code: expect.any(Number) } });
      expect((r.body as Record<string, unknown>).id).toBeUndefined();
    }
  });
});

describe('originHostGuard: Host', () => {
  it('allows the panel host and api.<BASE_DOMAIN>', () => {
    expect(run({ host: 'panel.example.com' }).status).toBe('next');
    expect(run({ host: 'api.panel.example.com' }).status).toBe('next');
  });
  it('refuses a rebinding-style host', () => {
    expect(run({ host: 'evil.example' }).status).toBe(403);
    expect(run({}).status).toBe(403);
  });
  it('accepts loopback hosts only on a local deployment', () => {
    expect(run({ host: 'localhost:3737' }).status).toBe(403);
    expect(run({ host: 'localhost:3737' }, { ...opts, isLocal: true }).status).toBe('next');
    expect(run({ host: '127.0.0.1:55555' }, { ...opts, isLocal: true }).status).toBe('next');
    expect(run({ host: '[::1]:3737' }, { ...opts, isLocal: true }).status).toBe('next');
    expect(run({ host: 'evil.example' }, { ...opts, isLocal: true }).status).toBe(403);
  });
});
