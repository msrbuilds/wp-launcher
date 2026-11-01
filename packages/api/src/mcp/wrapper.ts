import { AppError } from '../utils/errors';
import type { McpAuthContext } from '../oauth/token.service';
import { isEligible, type ToolDef } from './registry';
import { recordAudit } from './audit';
import { consumeWrite } from './limits';
import type { SdkToolResult, SdkToolSpec } from './sdk';

export const NOT_AVAILABLE_MESSAGE = 'This tool is not available on this panel.';

function errorResult(text: string, structured?: Record<string, unknown>): SdkToolResult {
  return { content: [{ type: 'text', text }], isError: true, ...(structured ? { structuredContent: structured } : {}) };
}

/**
 * Wraps a tool for the SDK. `run` is the backstop: whatever path a request took
 * to get here, it re-checks eligibility and scope before the handler body runs,
 * and a failure there is a bypass of the pipeline — a bug — so it is audited
 * and logged loudly. It then validates input, spends the write bucket, runs the
 * handler, and returns only the fields the output schema allows.
 */
export function toSdkTool(tool: ToolDef, ctx: McpAuthContext): SdkToolSpec {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.input,
    outputSchema: tool.output,
    annotations: tool.annotations,
    requiredScope: tool.scope,
    async run(rawArgs: unknown): Promise<SdkToolResult> {
      const started = Date.now();
      const audit = (outcome: 'ok' | 'error' | 'denied', extra: { error?: string; bypass?: boolean } = {}) =>
        recordAudit({ grantId: ctx.grantId, userId: ctx.userId, clientId: ctx.clientId, tool: tool.name, args: rawArgs, outcome, durationMs: Date.now() - started, ...extra });

      if (!isEligible(tool, ctx) || !ctx.scopes.includes(tool.scope)) {
        console.error(`[mcp] authorisation bypass: ${tool.name} reached the handler for grant ${ctx.grantId} without passing the pipeline`);
        audit('denied', { bypass: true, error: 'Refused by the wrapper backstop' });
        return errorResult(NOT_AVAILABLE_MESSAGE);
      }

      const parsed = tool.input.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        const message = `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`;
        audit('error', { error: message });
        return errorResult(message);
      }

      if (tool.writeBucket && !consumeWrite(tool.writeBucket, ctx.userId)) {
        audit('error', { error: 'Rate limit reached' });
        return errorResult('Rate limit reached for this kind of change. Try again in a few minutes.');
      }

      try {
        const result = await tool.handler(parsed.data, ctx);
        const structured = tool.output.parse(result) as Record<string, unknown>;
        audit('ok');
        return { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured };
      } catch (err) {
        if (err instanceof AppError) {
          audit('error', { error: err.message });
          return errorResult(err.message, { error: err.message, ...(err.details ?? {}) });
        }
        console.error(`[mcp] tool ${tool.name} failed:`, err);
        audit('error', { error: 'Internal error' });
        return errorResult('Internal error while running this tool.');
      }
    },
  };
}
