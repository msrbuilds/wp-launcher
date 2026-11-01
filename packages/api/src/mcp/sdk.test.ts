import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { buildMcpServer, createRequestHandler, scopeChallengeFor, SUPPORTED_PROTOCOL_VERSIONS, type SdkToolSpec } from './sdk';

const echoTool: SdkToolSpec = {
  name: 'echo',
  title: 'Echo',
  description: 'Returns its input.',
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ text: z.string() }),
  annotations: { readOnlyHint: true },
  run: async (args) => {
    const { text } = args as { text: string };
    return { content: [{ type: 'text', text: JSON.stringify({ text }) }], structuredContent: { text } };
  },
};

let server: Server;
let url: URL;
const sessionHeaders: (string | null)[] = [];

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.on('finish', () => sessionHeaders.push(String(res.getHeader('mcp-session-id') ?? '') || null));
    next();
  });
  app.post('/mcp', createRequestHandler(() => buildMcpServer({ name: 'test', version: '0.0.0' }, [echoTool])));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  url = new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`);
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function roundTrip(client: Client) {
  await client.connect(new StreamableHTTPClientTransport(url));
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toEqual(['echo']);
  const result = await client.callTool({ name: 'echo', arguments: { text: 'hi' } });
  expect(result.structuredContent).toEqual({ text: 'hi' });
  await client.close();
}

describe('v2 SDK adapter', () => {
  it('advertises exactly the three supported protocol versions', () => {
    expect([...SUPPORTED_PROTOCOL_VERSIONS]).toEqual(['2026-07-28', '2025-11-25', '2025-06-18']);
  });

  it('serves a 2026-07-28 client: tools/list then tools/call echo', async () => {
    await roundTrip(new Client({ name: 'modern', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } }));
  });

  it('serves a 2025-11-25 client through initialize, statelessly', async () => {
    sessionHeaders.length = 0;
    await roundTrip(new Client({ name: 'legacy', version: '1' }, { supportedProtocolVersions: ['2025-11-25'] }));
    expect(sessionHeaders.every((h) => h === null)).toBe(true);
  });

  it('serves a 2025-06-18 client through initialize', async () => {
    await roundTrip(new Client({ name: 'legacy', version: '1' }, { supportedProtocolVersions: ['2025-06-18'] }));
  });
});

describe('scope challenge', () => {
  it('fails closed: no authInfo is challenged, not waved through', () => {
    expect(scopeChallengeFor('sites:write')({ authInfo: undefined })).toEqual({ scopes: ['sites:write'] });
  });

  it('challenges a token that lacks the scope and passes one that has it', () => {
    const base = { token: 't', clientId: 'c', scopes: ['sites:read'] };
    expect(scopeChallengeFor('sites:write')({ authInfo: base })).toEqual({ scopes: ['sites:write'] });
    expect(scopeChallengeFor('sites:read')({ authInfo: base })).toBeUndefined();
  });
});
