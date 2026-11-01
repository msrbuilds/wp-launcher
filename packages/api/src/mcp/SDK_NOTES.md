# MCP SDK notes

Verified 2026-11-01 by `src/mcp/sdk.test.ts`.

- **Versions (exact pins):** `@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/node` 2.1.2,
  `@modelcontextprotocol/express` 2.0.2 (Express `^4.18 || ^5` peer; only its types are used today),
  `@modelcontextprotocol/client` 2.4.0 (dev, tests only). v2 is past beta, so these are stable releases.
- **Adapter:** `createMcpHandler(factory, { legacy: 'stateless', responseMode: 'json' })` wrapped with
  `toNodeHandler` from `@modelcontextprotocol/node`, mounted as an Express handler with `req.body` passed
  as the parsed body. `req.auth` reaches the factory as `ctx.authInfo`.
- **Eras:** one endpoint serves 2026-07-28 (sessionless envelope) and 2025-11-25 / 2025-06-18
  (`initialize`, stateless — no `Mcp-Session-Id`; GET/DELETE answer 405).
- **Header validation by the SDK:** the modern path reads `MCP-Protocol-Version`, `Mcp-Method` and
  `Mcp-Name`. The **legacy path accepts a missing `MCP-Protocol-Version`** (it defaults to the negotiated
  or `2025-03-26` version) — so `envelope.ts` must answer that case itself and never forward it.
- **Scope-challenge hook: present.** `registerTool(..., { scopeChallenge })` is resolved before dispatch in
  both eras (`WebStandardStreamableHTTPServerTransport` and the modern per-request path) and answered with
  HTTP 403 + `WWW-Authenticate: Bearer error="insufficient_scope", scope=…, resource_metadata=…`.
  `resource_metadata` comes from `authInfo.resourceMetadataUrl`. A tool that is not registered (ineligible)
  never challenges. Exposed through `SdkToolSpec.requiredScope`.
- **Default supported versions** in the SDK still include 2025-03-26 and 2024-*; `buildMcpServer` overrides
  them with `SUPPORTED_PROTOCOL_VERSIONS`.
