import { describe, expect, it } from 'vitest';
import { validateEnvelope } from './envelope';

const req = (body: unknown, headers: Record<string, string> = {}, method = 'POST') => ({ method, headers, body });
const call = (name = 'sites_list', id: number | string = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } });
const modernHeaders = (name = 'sites_list') => ({ 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': name });

function rejected(result: ReturnType<typeof validateEnvelope>) {
  if (result.ok) throw new Error('expected rejection');
  return result;
}

describe('validateEnvelope', () => {
  it('answers 405 to GET and DELETE', () => {
    expect(rejected(validateEnvelope(req(undefined, {}, 'GET'))).status).toBe(405);
    expect(rejected(validateEnvelope(req(undefined, {}, 'DELETE'))).status).toBe(405);
  });

  it('refuses a batch and a JSON-RPC response', () => {
    expect(rejected(validateEnvelope(req([call()], { 'mcp-protocol-version': '2025-11-25' }))).status).toBe(400);
    expect(rejected(validateEnvelope(req({ jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-protocol-version': '2025-11-25' }))).status).toBe(400);
  });

  it('refuses a body that is not JSON-RPC 2.0', () => {
    expect(rejected(validateEnvelope(req({ method: 'tools/list', id: 1 }, { 'mcp-protocol-version': '2025-11-25' }))).status).toBe(400);
    expect(rejected(validateEnvelope(req('nope', { 'mcp-protocol-version': '2025-11-25' }))).status).toBe(400);
  });

  it('answers an unsupported version with -32022 listing the supported ones', () => {
    const r = rejected(validateEnvelope(req(call(), { 'mcp-protocol-version': '2024-11-05' })));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: -32022, data: { supported: ['2026-07-28', '2025-11-25', '2025-06-18'] } } });
  });

  describe('2026-07-28', () => {
    it('accepts a request whose headers match the body, decoding a base64 Mcp-Name', () => {
      expect(validateEnvelope(req(call(), modernHeaders()))).toMatchObject({ ok: true, era: '2026', kind: 'request', method: 'tools/call', toolName: 'sites_list', id: 1 });
      const encoded = `=?base64?${Buffer.from('sites_list').toString('base64')}?=`;
      expect(validateEnvelope(req(call(), { ...modernHeaders(), 'mcp-name': encoded })).ok).toBe(true);
    });

    it('answers -32020 when Mcp-Name or Mcp-Method disagrees with the body or is missing', () => {
      const variants: Record<string, string>[] = [
        { ...modernHeaders(), 'mcp-name': 'sites_delete' },
        { ...modernHeaders(), 'mcp-method': 'tools/list' },
        { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call' },
        { 'mcp-protocol-version': '2026-07-28' },
      ];
      for (const headers of variants) {
        const r = rejected(validateEnvelope(req(call(), headers)));
        expect(r.status).toBe(400);
        expect(r.body).toMatchObject({ error: { code: -32020 } });
      }
    });

    it('refuses notifications (none are defined over HTTP in this revision)', () => {
      const r = validateEnvelope(req({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'notifications/initialized' }));
      expect(rejected(r).status).toBe(400);
    });
  });

  describe('2025 era', () => {
    it('accepts requests and notifications that carry the header', () => {
      expect(validateEnvelope(req(call(), { 'mcp-protocol-version': '2025-11-25' }))).toMatchObject({ ok: true, era: '2025', kind: 'request', toolName: 'sites_list' });
      expect(validateEnvelope(req({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-protocol-version': '2025-06-18' }))).toMatchObject({ ok: true, era: '2025', kind: 'notification' });
    });

    it('accepts a headerless initialize for a supported 2025 version', () => {
      for (const v of ['2025-11-25', '2025-06-18']) {
        expect(validateEnvelope(req({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: v, capabilities: {}, clientInfo: { name: 'c', version: '1' } } })))
          .toMatchObject({ ok: true, era: '2025', kind: 'request', method: 'initialize' });
      }
    });

    it('passes a headerless initialize for another version through to negotiation, never as 2025-03-26', () => {
      const r = validateEnvelope(req({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05' } }));
      expect(r).toMatchObject({ ok: true, era: '2025', version: '2025-11-25' });
    });

    it('rejects every other headerless message', () => {
      expect(rejected(validateEnvelope(req({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).status).toBe(400);
      expect(rejected(validateEnvelope(req(call()))).status).toBe(400);
      expect(rejected(validateEnvelope(req({ jsonrpc: '2.0', method: 'notifications/initialized' }))).status).toBe(400);
    });
  });
});
