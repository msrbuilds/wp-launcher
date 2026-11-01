import type { RequestHandler } from 'express';
import { validateEnvelope } from './envelope';
import { getTool, isEligible } from './registry';
import { NOT_AVAILABLE_MESSAGE } from './wrapper';
import { mcpContextOf } from './bearer';

/**
 * Steps 3–4 of the request pipeline (1–2 are originHostGuard and bearerGuard).
 *
 * 3. Envelope: answered here on failure, never forwarded.
 * 4. Eligibility: a tools/call for a tool this user's role or feature flags
 *    hide gets a business refusal here — no scope challenge, since more consent
 *    could not fix it. An unknown tool is forwarded: nothing can run for it.
 *
 * Step 5, the scope challenge, is the SDK's (`registerTool({ scopeChallenge })`,
 * see SDK_NOTES.md), and the wrapper re-checks scope before any handler runs.
 */
export function pipeline(): RequestHandler {
  return (req, res, next) => {
    const envelope = validateEnvelope(req);
    if (!envelope.ok) {
      if (envelope.status === 405) res.set('Allow', 'POST');
      res.status(envelope.status).json(envelope.body);
      return;
    }
    if (envelope.method === 'tools/call' && envelope.toolName) {
      const tool = getTool(envelope.toolName);
      if (tool && !isEligible(tool, mcpContextOf(res.locals))) {
        res.status(200).json({
          jsonrpc: '2.0',
          id: envelope.id ?? null,
          result: { content: [{ type: 'text', text: NOT_AVAILABLE_MESSAGE }], isError: true },
        });
        return;
      }
    }
    next();
  };
}
