# MCP Server with OAuth — Design

**Date:** 2026-11-01
**Status:** Approved, ready for planning

## Problem

Everything an operator does in WP Launcher — launching a demo for a prospect,
snapshotting it, opening a project for the client, raising the invoice, writing
to the client — happens by clicking through the panel. AI agents (Claude,
ChatGPT) can already work *inside* a WordPress site through WP-side MCP servers,
but nothing lets them work the panel itself.

This adds a **Model Context Protocol server** to WP Launcher so an agent can
manage sites and the Mini CRM on a staff user's behalf, authorised through
**OAuth 2.1** the way remote MCP connectors expect: the user pastes one URL into
their agent, signs in to their panel, ticks what the agent may do, and is done.
No API keys copied around.

**Why now — both reasons count equally:** the operator's own agency workflow
(run demos and the CRM from Claude), and a headline feature for WP Launcher
users. So the consent screen, Connected-apps page and setup guide must be
product quality, not developer scaffolding.

## Goals

- One remote MCP endpoint that Claude.ai / Claude Desktop custom connectors,
  Claude Code, and ChatGPT can connect to with no manual client setup, verified
  against a **tested client matrix** (see *Protocol versions and client
  matrix*). Other MCP clients are supported to the extent they follow the
  pinned protocol versions; the promise is the matrix, not "every client".
- WP Launcher is its own OAuth authorisation server: no Auth0/Keycloak to set up
  on a self-hosted install.
- An agent acts **as the staff user who authorised it**, with no more access
  than that user has, narrowed further by the scopes ticked at consent.
- Coverage: site lifecycle, snapshots & cloning, PHP config & health, platform
  admin, and all of Mini CRM (clients, projects, boards, invoices, messages,
  notifications).
- The operator can see every connected agent, see what each one did, and revoke
  any of them in one click.

## Non-goals (v1)

- **Reaching inside WordPress.** No WP-CLI, no post/plugin editing. Tools hand
  back the site URL and an autologin link; inside-WP work belongs to WP-side MCP
  servers (e.g. eMCP).
- **Members and portal clients.** Only owner/admin can authorise an agent.
  Members never get MCP; portal clients never get MCP.
- **An external identity provider.**
- **Personal access tokens / API-key auth on `/mcp`.** OAuth only.
- **Binary transfer.** No upload of card attachments or payment proofs, no
  download of proof files, snapshots or export ZIPs through MCP.
- **MCP resources, prompts, or UI widgets.** Tools only.

## Anti-goals — failure even if it "works"

- **An MCP token that unlocks the REST API.** Agent tokens must be useless
  anywhere except `/api/mcp`. (`userAuth` accepts any `JWT_SECRET`-signed JWT
  carrying a `userId`; an access token of that shape would silently grant the
  whole panel, unscoped.)
- **A tool that is more permissive than the panel.** If the REST route would
  refuse the user (feature off, wrong role, not their row), the tool refuses.
- **An agent that can widen its own access** — enabling features, changing
  roles, inviting users, approving other OAuth clients, or touching MCP's own
  settings.
- **An agent that settles money.** Accepting or rejecting a payment proof stays
  human-only, for the same reason `awaiting_verification` exists at all. An
  agent never sets an invoice to `paid`, never moves one out of
  `awaiting_verification`, and never cancels a paid invoice (decided — see
  *Invoice transitions*).
- **Cookie-authenticated `/mcp`.** The endpoint accepts bearer tokens only, so a
  logged-in operator's browser can never be driven into tool calls cross-site.
- **Silent revocation gaps.** Changing a password or email, demoting a user,
  deleting a user, or revoking an app must stop the agent on its next call.

## Deployment facts the design rests on

- The dashboard's nginx proxies `/api/` to the API (`packages/dashboard/nginx.conf`);
  standalone compose also exposes `api.${BASE_DOMAIN}` directly; Dokploy routes
  `Host(BASE_DOMAIN)` to the dashboard. `PUBLIC_URL` is the canonical public
  origin everywhere.
- Claude.ai / ChatGPT connect from their servers, so they need a **public HTTPS**
  `PUBLIC_URL`. Claude Code can connect to a localhost install. Both must work;
  only the reach differs.
- `csrfProtection` is global and rejects cross-origin non-GET requests lacking
  the dashboard Origin and `X-Requested-With` — OAuth and MCP endpoints called by
  agents must be exempted the way the productivity heartbeat is.
- Site and CRM services mostly take `userId` / `userRole` and enforce ownership
  (`createSite({ userId, userRole, … })`, `cloneSite(id, userId)`), so tools can
  call services directly. **But not all guards live in services:** `getSite` and
  `getSiteStatus` do no ownership check, autologin minting is written inline in
  `routes/sites.ts`, and the `isFeatureEnabled('projects', …)` check lives in
  `routes/projects.ts`. Those must be moved into shared helpers both callers use
  (see *Tool authorisation*).
- **Services return raw rows containing secrets.** `getSite`, `listUserSites`
  and friends are `SELECT *` on `sites`, which includes `admin_password` and
  `auto_login_token`. REST routes hand-pick safe fields before responding; a
  tool that returned a service result as-is would leak credentials under
  `sites:read`. See *Tool output contract*.
- **Shared users get nothing today.** `GET /api/sites/:id`, autologin and
  `getSiteForSnapshot` all refuse non-owners, including accepted shares;
  `hasAccessToSite` exists but those paths do not use it.
- **The REST API does not enforce several per-site feature flags.** `cloning`,
  `snapshots`, `phpConfig` and `templates` are hidden by the UI only; `siteExtend`
  is checked in `extendSite` but only against the admin row. See *Feature flags*.
- Global CORS is an allowlist **with credentials**, so any-origin endpoints need
  their own `cors()` mounted before the global one.
- `/login` has no `?next=` support today; the consent flow needs it added.

## Architecture

```
Agent (Claude.ai / Claude Code / ChatGPT)
   │  1. GET /api/mcp → 401 + WWW-Authenticate: resource_metadata=…
   │  2. GET /.well-known/oauth-protected-resource[/api/mcp]
   │  3. GET /.well-known/oauth-authorization-server
   │  4. client_id = HTTPS metadata URL (CIMD, fetched by the server at step 5)
   │     — or, for older clients, POST /api/oauth/register (DCR)
   │  5. browser → {PUBLIC_URL}/oauth/authorize?…  (dashboard consent page)
   │        staff login (existing session) → tick scopes → Approve
   │        dashboard POST /api/oauth/authorize/decision (cookie + CSRF)
   │        → redirect_uri?code=…&state=…
   │  6. POST /api/oauth/token   (code + PKCE verifier → access + refresh)
   │  7. POST /api/mcp  Authorization: Bearer <opaque token>
   ▼
API (Express, port 3737)
   mcp/ router ── bearer guard ── tool registry ── existing services
   oauth/ router ── oauth.service ── SQLite tables
```

**Placement (decided):** inside the API process, mounted at **`/api/mcp`**. No
new container. It reuses services, DB, feature flags and logging directly.

**SDK (decided): the v2 TypeScript SDK, exact-pinned.** v2 is in beta
(`2.0.0-beta.x` at the time of writing), and that was accepted knowingly: it is
the only line that serves protocol `2026-07-28`. The v1
`@modelcontextprotocol/sdk` and its `*StreamableHTTPServerTransport` serve
2025-era clients only.
- Packages: `@modelcontextprotocol/server` (the `McpServer` and
  `createMcpHandler`), plus `@modelcontextprotocol/express` for its
  `hostHeaderValidation` / `originValidation` / `metadataRouter` helpers if it
  runs on Express 4. If it does not, use `@modelcontextprotocol/node` on raw
  `req`/`res` and write the validation middleware ourselves (it is small; see
  *Origin and Host validation*).
- **Exact versions, no `^`.** Upgrading the SDK is a deliberate change that
  reruns Stage 1 in full.
- v2 requires `zod ^4.2.0` and Node 20+. The repo is on `zod ^4.3.6`; confirm
  the API image's Node version.
- The v2 SDK does **not** provide an OAuth authorisation server. Its old
  `mcpAuthRouter` / `OAuthServerProvider` sit in the frozen, deprecated
  `@modelcontextprotocol/server-legacy/auth` package and must not be used. See
  *Library* below.

**Canonical MCP URL:** `${PUBLIC_URL}/api/mcp`. This is what the user pastes into
their agent and what the panel's setup card shows with a copy button.

**Transport (decided):** `createMcpHandler(() => createServer(ctx))`, which
serves both protocol generations from the one endpoint:
- **2026-07-28** — sessionless: every request is its own POST carrying
  `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, which the
  handler validates against the body (400 `HeaderMismatch` on disagreement).
  GET/DELETE answer 405.
- **2025-11-25 / 2025-06-18** — the `initialize` handshake. Serve them through
  the handler's stateless legacy path; **no `Mcp-Session-Id` sessions** (no
  session store; an API restart must not strand clients). If a tested client
  in the matrix turns out to require sessions, that is a decision to bring
  back, not something to add quietly.
- **Missing `MCP-Protocol-Version` header:**
  - A headerless **`initialize`** request is accepted when its body's
    `params.protocolVersion` is `2025-11-25` or `2025-06-18`. In the 2025-era
    spec the header is required only on requests *after* initialisation, so a
    valid client may legitimately omit it here.
  - A headerless `initialize` asking for any other version is answered with
    the version negotiation the 2025 spec defines (the server offers a version
    it supports). It is never silently assumed to be `2025-03-26`.
  - **Any other headerless request is rejected with 400.** That covers every
    non-`initialize` method, every 2026-07-28 request (where the header is
    always required), and the pre-2025-06-18 clients that never send it.
  - A header naming an unsupported version gets 400
    `UnsupportedProtocolVersionError`, listing the supported versions.

A server factory per request gets the request's auth context, so a server
instance never outlives the token that created it. Prefer JSON responses;
where SSE is used, send `X-Accel-Buffering: no`, and give nginx a dedicated
`location /api/mcp` with `proxy_buffering off`.

**Well-known endpoints** must be served at the **origin root**, so the dashboard
nginx gets a `location ^~ /.well-known/oauth-` that proxies to the API (and the
standalone `api.` router serves them natively). Serve both the path-suffixed
form (`/.well-known/oauth-protected-resource/api/mcp`, RFC 9728) and the root
form, since clients differ in which they probe.

## OAuth authorisation server

**Decided:** WP Launcher issues its own tokens. OAuth 2.1 profile as required by
the MCP authorization spec:

| Piece | Behaviour |
|---|---|
| Metadata | RFC 8414 AS metadata + RFC 9728 protected-resource metadata. `issuer = PUBLIC_URL` |
| Registration | **Client ID Metadata Documents (primary)** — the MCP spec's SHOULD, and what Claude's recommended "published identity" option relies on: an HTTPS URL as `client_id`, metadata fetched and validated by the server (see *CIMD fetching*). **RFC 7591 Dynamic Client Registration (compatibility)** — deprecated by the spec but still used by some clients; public clients only (`token_endpoint_auth_method: none`). Advertise `client_id_metadata_document_supported: true` and `registration_endpoint` in AS metadata. Pre-registered clients are not offered |
| Issuer in response | Include `iss` in every authorization response, success and error (RFC 9207), and advertise `authorization_response_iss_parameter_supported: true` |
| Grant types | `authorization_code` with **PKCE S256 mandatory**; `refresh_token`. No implicit, no password, no client-credentials |
| Resource indicators | Honour RFC 8707 `resource`; tokens are bound to the MCP URL (audience) and rejected for any other |
| Redirect URIs | Exact-match against registered URIs. `https` required except loopback (`http://127.0.0.1:*`, `http://localhost:*`) for desktop/CLI clients |
| Token lifetime | **Access 1 h. Refresh 30 days, rotated on every use**, with reuse detection: presenting an already-rotated refresh token revokes the whole grant |
| Token format | **Opaque random strings, stored as SHA-256 hashes** (my call — see below) |

**Why opaque tokens (my call):** revocation, demotion and `token_version`
changes must bite on the very next call, so every request needs a DB lookup
anyway — a self-contained JWT buys nothing and risks being mistaken for a panel
JWT. Opaque tokens can never pass `userAuth`, because `jwt.verify` rejects them.
Prefix them (`wplmcp_at_…`, `wplmcp_rt_…`) so they are recognisable in logs and
secret scanners.

**Revocation ties (decided):** each grant records the user's `token_version` at
issue. A mismatch on any request or refresh invalidates the grant — so password
change and email change (the only two things that bump `token_version` today)
disconnect agents too. There is no "log out everywhere" control in the panel and
this work does not add one (my call); Connected apps' per-app and **Revoke all**
buttons cover the agent side of it.
Role is read from the DB on every call; a user no longer owner/admin, or no
longer verified, gets 401.

**Library (my call): hand-rolled authorisation server, narrow profile.** The MCP
SDK no longer offers one (above). General-purpose servers such as
`oidc-provider` bring OpenID Connect, sessions and their own storage model,
yet still need custom code for the parts that matter most here: CIMD, the
`token_version` binding, and the code-to-grant lifecycle. The profile we need
is small: one grant type plus refresh, public clients, PKCE S256, two
registration paths, and two metadata documents. Write it as `src/oauth/`
against SQLite, with every endpoint covered by tests written from the RFC
text. Use well-tested primitives only (Node `crypto` for randomness and
hashing; no hand-written base64url or PKCE helpers when the platform has them).

**CIMD fetching (my call on the details):** the server fetches a URL a stranger
chose, from inside the Docker network, so the fetcher must:
- accept `https://` only, on port 443, with a non-root path;
- resolve the host and refuse loopback, RFC 1918, link-local, CGNAT, ULA and
  metadata addresses — and connect to the address it validated (no
  re-resolution, so DNS rebinding cannot swap it);
- follow no redirects, time out in ~5 s, cap the body at ~64 KB, require JSON;
- require the document's `client_id` to equal the URL exactly, and its
  `redirect_uris` to satisfy the redirect rules below;
- cache by URL, honouring `Cache-Control` within bounds (e.g. 5 min – 24 h), so
  every authorisation does not refetch.
Fetches happen only at `/authorize` (to render consent) and `/token`, both
rate-limited.

**Protocol versions and client matrix:** the server targets MCP **2026-07-28**
and also serves **2025-11-25** and **2025-06-18** through the handler's legacy
path (see *Transport*). Both generations are covered by **automated Stage 1
tests** that drive the real handler with an SDK client of each era. The manual
pass confirms real clients; it is not where protocol support is first
discovered. Release also requires a manual pass, recorded
in `guides/mcp.md`, of the full connect → tool call → refresh → revoke cycle
with: Claude.ai custom connector (published identity, and register
automatically), Claude Desktop, Claude Code, and ChatGPT. A client that fails
is listed as unsupported in the guide, not silently promised.

**Abuse controls on open registration (my call):**
- `POST /api/oauth/register` gets its own rate limit (e.g. 10 / hour / IP).
- Clients never authorised are pruned after 24 h by the existing cleanup cron.
- `client_name` and `logo_uri` are self-asserted, so the consent screen labels
  every client **"unverified"** and shows the redirect host prominently — the
  host is the thing a user can actually judge.

**Feature gate:** new admin-only feature **`mcp`**, off by default. When off,
`/api/mcp`, `/api/oauth/*` and the well-known endpoints answer 404 (absent, not
refused — same posture as the client portal) and the consent page says MCP is
disabled. Turning it off does not delete grants; turning it back on restores
them unless they expired.

## Scopes

**Decided:** coarse read/write per area, ticked on the consent screen.

| Scope | Grants |
|---|---|
| `sites:read` | list/get sites, status, readiness, snapshots list, PHP config read, health, blueprints list (needed to launch) |
| `sites:write` | launch, extend, delete, clone, snapshot create/restore/delete, PHP config update, autologin link, site password |
| `crm:read` | clients, projects, boards, invoices, payment methods, proofs list, messages, notifications |
| `crm:write` | create/update/delete clients, projects, board columns/cards/comments; post client messages; mark notifications read |
| `invoices:write` | create/edit/delete draft invoices, attach payment methods, send a draft, cancel an unpaid invoice |
| `admin:read` | stats, site logs, users list, images list, build jobs |
| `admin:write` | blueprint create/edit/delete, image build/rebuild/delete |

Notes:
- `invoices:write` is split from `crm:write` because sending an invoice puts it
  in front of the client (it appears in their portal) and changing status
  touches the books. Status changes send no email today, and this work does not
  add one.
- `admin:*` is only offered on the consent screen to users whose role allows the
  underlying routes; the tool still re-checks role on every call.
- The consent screen lists **every** scope, pre-ticks the ones the client asked
  for, and lets the user tick or untick any of them. The granted set is what
  gets stored.
- **`tools/list` filters by role and feature flags, not by granted scope (my
  call).** A tool the user could never use (feature off, admin-only for a role
  they lack) is hidden. A tool merely outside this grant's scopes **is
  listed**, with the required scope named in its description. Calling it
  produces an HTTP-level `insufficient_scope` challenge (see *Errors*), so the
  client can ask for more access (step-up authorisation) instead of never
  knowing the tool exists.
- Protected-resource metadata `scopes_supported` and the initial 401
  challenge carry the **read scopes** (`sites:read crm:read`), the minimal set
  the spec asks for. AS metadata `scopes_supported` lists all scopes. Writes
  arrive by step-up, or because the user ticked them at first consent.

## Tool catalogue

Coverage is decided (all areas the user picked); exact names and grouping are
the builder's, within these rules:

- Names are `snake_case`, area-prefixed: `sites_*`, `snapshots_*`, `crm_clients_*`,
  `crm_projects_*`, `crm_board_*`, `crm_invoices_*`, `crm_messages_*`,
  `notifications_*`, `admin_*`.
- Keep the catalogue to roughly **40–50 tools**. Consolidate where it reads
  naturally (e.g. one `crm_board_card_update` taking optional title/description/
  due date/labels rather than one tool per field). Agents choose worse from 90.
- Every input schema is zod, with descriptions written for a model: what the
  field means, its format, and valid values (e.g. list the blueprint ids tool
  rather than expecting the agent to guess one).
- Every tool sets MCP annotations: `readOnlyHint` on reads; `destructiveHint` on
  anything that deletes, emails someone, or changes money state;
  `idempotentHint` where true.
- Results are compact JSON text, with ids, and the panel URL of the thing where
  one exists, so the agent can hand the operator a link — shaped by the
  *Tool output contract* below.

### Tool output contract

Every tool declares an **output schema** (zod, also published as the MCP
`outputSchema` and returned as `structuredContent`), and the wrapper builds the
result by **picking only the schema's fields** from whatever the handler
returns — an allowlist, never a blocklist. A service that later gains a column
cannot leak it through MCP.

- Site outputs never include `admin_password`, `auto_login_token`, DB
  credentials, `container_id` or share tokens. They carry `adminUser` only, as
  `GET /api/sites/:id` does.
- The only tools whose output schema contains a credential are
  `sites_launch` (the one-time admin password the REST launch already returns)
  and `sites_autologin_link` (a single-use, 60-second URL). Both require
  `sites:write`.
- CRM outputs exclude `client_users.password_hash` / invite tokens, file
  `storage_path`s, and anything else REST does not return.
- Where a REST route already projects a response, the tool's schema matches
  that projection; the projection moves into a shared mapper both use, so they
  cannot drift.

Indicative set:

**Sites** — `sites_list`, `sites_get`, `sites_launch` (blueprint, title, expiry,
PHP, DB engine…), `sites_wait_ready`, `sites_extend`, `sites_delete`★,
`sites_autologin_link`, `sites_clone`, `sites_php_config_get`,
`sites_php_config_update`, `sites_health`, `blueprints_list`.
**Snapshots** — `snapshots_list`, `snapshots_create`, `snapshots_restore`★,
`snapshots_delete`★.
**CRM** — `crm_clients_{list,get,create,update,delete★}`,
`crm_projects_{list,get,create,update,delete★,link_site,unlink_site}`,
`crm_board_get`, `crm_board_column_{create,update,delete★,reorder}`,
`crm_board_card_{create,update,move,delete★}`, `crm_board_comment_add`,
`crm_invoices_{list,get,create,update,delete★,set_status★,set_payment_methods}`,
`crm_payment_methods_list`, `crm_proofs_list` (read only),
`crm_messages_{list,send★}`, `notifications_{list,mark_read}`.
**Admin** — `admin_stats`, `admin_site_logs`, `admin_users_list`,
`admin_images_list`, `admin_images_build`, `admin_images_rebuild`,
`admin_images_delete★`, `admin_build_job_get`,
`admin_blueprints_{get,create,update,delete★}`.

★ = `destructiveHint: true`.

**Deliberately absent (my calls, flagged for review):**
- Payment proof accept/reject — human-only (decided).
- User invite, delete, role change; feature flags; settings; branding; SMTP;
  API key; webhooks; remote sync connections; the client-portal user list — all
  widen access, send mail to new parties, or expose secrets.
- DB credentials, Adminer, tunnels, custom domains, site sharing, export ZIP —
  secrets or outward-facing changes with little agent value in v1.
- Site admin password: `sites_launch` returns the one-time password the route
  already returns, but prefer pointing the agent at `sites_autologin_link`;
  there is no "read the password later" tool. Everything a tool returns ends up
  in the agent provider's context and logs.

## Site reach (decided)

An agent sees and manages **only sites the authorising user owns** — v1 is
owner-only, matching what REST actually enforces today (shared users are
refused by the site routes and snapshot service alike). Shared-site access
would need an operation-by-operation owner / shared-admin / shared-viewer
matrix applied to REST and MCP together; that is a follow-up, not something
MCP gets first. No admin override: `sites_list` never takes an `all` flag, and
members' demo sites are invisible and untouchable — the same no-override rule
Mini CRM follows. The wrapper resolves ownership through one shared helper
(e.g. `siteForUserOrFail(siteId, userId)`), answering "Site not found" whether
the site is missing or someone else's. `getSite`/`getSiteStatus`, which check
nothing today, must not be called from a tool without it.

`admin_stats` and `admin_site_logs` stay install-wide, as they are platform
reports under `admin:read`; they let an agent *see* totals and log lines, never
act on a site it does not own.

## Invoice transitions (decided)

`crm_invoices_set_status` accepts exactly two transitions and refuses the rest
even where `updateInvoiceStatus` would allow them:

- `draft → sent`
- `draft | sent | overdue → cancelled`

Never `→ paid`, never anything out of `awaiting_verification`, never
`paid → cancelled`. The tool describes this in its schema so an agent tells the
operator to do it in the panel instead of retrying.

## Feature flags (decided)

Tools enforce the flags **the panel UI honours**, even where the REST route
does not: switching `cloning`, `snapshots`, `phpConfig`, `templates`,
`siteExtend` etc. off removes those tools from `tools/list` and refuses calls,
resolved with `isFeatureEnabled(key, role)`. The admin-only `projects` flag
gates every `crm_*` tool. Closing the same gap in the REST API is **out of
scope** and logged as a follow-up, so existing API/CLI behaviour does not
change in this work.

## Tool authorisation

Every tool is declared with what it needs, and **one central wrapper** enforces
it before the handler runs — never ad hoc per tool:

```ts
defineTool({
  name: 'sites_clone',
  scope: 'sites:write',
  feature: 'cloning',          // optional; resolved with isFeatureEnabled(key, role)
  minRole: 'admin',            // default for every tool
  destructive: false,
  input: z.object({ … }),
  handler: (args, ctx) => cloneSite(args.siteId, ctx.userId, { … }),
});
```

`ctx` carries `userId`, `userEmail`, `userRole` (from the DB, this request) —
the same three fields routes pass to services. Handlers call **services, never
routes**, and never re-implement ownership checks the service already does.

For each tool, the builder checks the corresponding REST route and moves any
guard that lives only in the route (ownership, role check, input validation)
into the declaration or a shared helper used by both. A test per area asserts
that a tool refuses whatever its REST twin refuses (foreign row, insufficient
role) **and** whatever the panel UI hides (feature off) — the tool may be
stricter than REST, never looser.

**Rate limits (my call):** route-level limiters (`siteWriteLimiter` and friends)
do not apply because tools bypass routes. So:
- `/api/mcp` has its own limiter keyed by grant (e.g. 300 req / 15 min).
- Write tools share per-user buckets matching the REST write limits for the
  same area (e.g. site creation/clone counts against the same 10 / 15 min the
  REST route allows), so an agent cannot launch faster than the panel would.
- Service-level caps (`MAX_SITES_PER_USER`, `MAX_TOTAL_SITES`) apply unchanged.

### Errors

There are two contracts, and they never mix.

**Authorisation failures are HTTP responses with an OAuth challenge**, decided
*before* the MCP handler runs:

| Condition | Response |
|---|---|
| No token, or malformed, unknown, expired, wrong audience, revoked, version mismatch, user demoted | **401**, `WWW-Authenticate: Bearer resource_metadata="…", scope="sites:read crm:read"` |
| Valid token, but `tools/call` names a tool whose scope the grant lacks | **403**, `WWW-Authenticate: Bearer error="insufficient_scope", scope="<the tool's scope>", resource_metadata="…", error_description="…"` |

The challenge carries every scope the operation needs, in one response.
`WWW-Authenticate` is listed in `Access-Control-Expose-Headers` so that browser
clients can read it.

### Request pipeline order (decided)

Each step runs only if every step before it passed. The first failure answers
the request.

1. **Origin and Host** → 403 (see *Origin and Host validation*).
2. **Authenticate the bearer token** → 401 with challenge.
3. **Validate the protocol envelope** → 400. This step checks:
   - the body is a single JSON-RPC message of a type **the request's protocol
     version permits from a client**:

     | Version | Requests | Notifications | Responses | Batches |
     |---|---|---|---|---|
     | 2025-06-18, 2025-11-25 | yes | yes, e.g. `notifications/initialized` (required after `initialize`), `notifications/cancelled` | no: this server never sends requests to the client, so there is nothing to answer | no (removed in 2025-06-18) |
     | 2026-07-28 | yes | no: this revision defines none over Streamable HTTP, so the answer is 400, which the transport allows for a notification the server cannot accept | no | no |

     Every message type the table allows is forwarded to the handler. A
     notification never names or runs a tool, so steps 4–5 do not apply to it
     and the handler answers it with **202 and an empty body**. Only
     `tools/call` passes through steps 4–5, and the wrapper re-checks it in
     every case.
   - the protocol version is supported, using the header rules in
     *Transport*;
   - for 2026-07-28, `Mcp-Method` and `Mcp-Name` agree with the body
     (`HeaderMismatch`).

   A malformed request never reaches the scope check, so it can never be
   answered with a consent challenge.
4. **Resolve the tool and check eligibility.** Only for `tools/call`:
   - An unknown tool name gets the handler's normal unknown-tool error.
   - A tool hidden for this user's role or feature flags gets an `isError`
     business refusal ("not available on this panel").

   Both are answered **without** a challenge, because more consent cannot
   fix either.
5. **Check scope.** If the tool's scope is not in the grant → 403
   `insufficient_scope` with challenge.
6. **Handler.** The tool runs. Business failures are `isError` results.

**Fail closed: nothing reaches a tool unless authorisation has passed.** Two
layers enforce this, and either one alone is enough to stop an unauthorised
call:

1. **The pre-handler middleware answers its own validation failures.** When
   step 3 finds a problem this application imposes (missing or unsupported
   protocol version, header/body mismatch, not a single JSON-RPC request), the
   middleware **returns the spec-shaped 400 itself**. It never forwards an
   invalid request and relies on the SDK to reject it, because the SDK's
   legacy path, for one, accepts a missing protocol-version header. A request
   is forwarded to `createMcpHandler` only after steps 1–5 have all passed.
2. **The central tool wrapper re-checks eligibility and scope before the
   handler body runs.** This is the backstop for any request that reaches the
   SDK by a path the middleware did not anticipate. On failure it does not
   execute the tool: it returns an error and writes a `denied` audit row
   flagged as a middleware bypass. A bypass is a bug, and it is logged at
   error level. The wrapper's check is unconditional; no tool can opt out of
   it.

**Prefer the SDK's own scope-challenge hook, if the pinned version has one.**
If the pinned v2 build provides a supported way for a tool (or a request hook)
to signal insufficient scope and have the handler answer with HTTP 403 and
`WWW-Authenticate`, use it in the wrapper. The wrapper then becomes the
primary scope check, and the middleware shrinks to steps 1–3 plus the
eligibility lookup. This avoids a second protocol parser drifting from the
SDK's. Verify the hook exists in the pinned version before relying on it; if
it does not, the two-layer design above stands as written. Either way, the
wrapper check in (2) stays in place.

**Business failures are tool results.** These are refusals that a wider consent
could not fix: the feature is off, the site is not found or belongs to someone
else, an invoice transition is not allowed, a cap is reached, or validation
failed. They become `isError: true` results carrying the message and the
`AppError` `details` (e.g. `IMAGE_NOT_BUILT` + `rebuildable`, so an agent can
offer `admin_images_rebuild`). Unexpected errors are logged server-side and
return a generic message.

The scope question is settled at the HTTP layer in step 5 of the pipeline
below. A tool handler never throws a scope error itself, so the two contracts
cannot be confused.

## Data model

New tables (names indicative):

- **oauth_clients** — client_id, kind (cimd|dcr), client_name, logo_uri,
  redirect_uris (JSON), metadata_fetched_at, metadata_expires_at, created_at,
  last_authorized_at. Public clients only, so no secret. For CIMD the
  `client_id` *is* the metadata URL and the row is a cache of the fetched
  document; for DCR it is a random id the server minted.
- **oauth_auth_codes** — code_hash, client_id, user_id, scopes, redirect_uri,
  code_challenge, resource, **token_version** (captured at approval),
  expires_at (≤ 60 s), used_at, **grant_id** (set on redemption),
  invalidated_at.
- **oauth_grants** — id, client_id, user_id, scopes, resource, token_version,
  created_at, last_used_at, revoked_at. One row per authorisation — this is what
  the Connected-apps page lists and what "revoke" stamps.
- **oauth_tokens** — token_hash, grant_id, kind (access|refresh), expires_at,
  rotated_at, replaced_by. Refresh rotation marks the old row; presenting a
  rotated refresh token revokes the grant (see *Refresh rotation*).
- **mcp_audit_log** — id, grant_id, user_id, client_id, tool, args_summary
  (JSON, redacted), outcome (ok|error|denied), error, duration_ms, created_at.

### Code-to-grant lifecycle

The version check must hold across the gap between the user clicking Approve
and the client redeeming the code:

1. **Approve** writes the code with the user's *current* `token_version`.
2. **Redeem** runs in **one SQLite transaction**: look up the code; refuse if
   used, invalidated, expired, PKCE-mismatched, or if its `token_version` no
   longer equals the user's; otherwise stamp `used_at`, create the grant
   **carrying the code's `token_version`** (never re-read from the user), issue
   the tokens, and write `grant_id` back on the code. A password change
   between approve and redeem therefore yields no grant.
3. **Replay** of a used code revokes the grant named by its `grant_id` and all
   its tokens (OAuth 2.1 §4.1.3).
4. **Revoke all** (and an owner revoking a user's apps) also stamps
   `invalidated_at` on that user's unredeemed codes, so an approval in flight
   cannot land after the user cut everything off. Revoking one app invalidates
   that client's pending codes for that user.

Re-authorising the same client for the same user replaces the previous grant
at redemption rather than stacking a second row (my call).

### Refresh rotation

Same atomicity contract as redemption. A refresh runs in **one SQLite
transaction**:

1. Look up the refresh token. If the token is unknown or expired, the result
   is `invalid_grant`.
2. **Load the grant inside the transaction** and refuse if it is revoked, if
   its `token_version` no longer matches the user's, or if the user is no
   longer verified owner/admin.
3. **Consume conditionally:**
   `UPDATE oauth_tokens SET rotated_at = now WHERE token_hash = ? AND rotated_at IS NULL`.
   If this changes **0 rows**, the token was already used. That is reuse:
   revoke the grant and all its tokens, and return `invalid_grant`.
4. Only after a successful consume, insert the successor access and refresh
   tokens and set `replaced_by`.

**Concurrent refresh (my call: strict, no grace window).** Two requests that
present the same refresh token can never both produce valid successors. The
conditional update lets exactly one win; the loser counts as reuse, which
revokes the grant, so the winner's successors die too and the user
reconnects. A grace window would be kinder to a client that retries, but it
is exactly the hole that reuse detection exists to close.

**Refresh racing a revoke.** Revocation stamps `oauth_grants.revoked_at`, and
**every access-token check reads the grant live**. A refresh committed just
before the revoke mints tokens that fail on their first use. A refresh
starting after the revoke is refused in step 2. Nothing a refresh does can
un-revoke a grant. better-sqlite3 runs transactions synchronously in one
process, which serialises them today; the contract is written so it would
still hold if that changed.

Expired codes/tokens and audit rows older than **90 days** are pruned by the
existing cleanup cron (retention is my call).

**Redaction:** `args_summary` drops any key matching
`/password|secret|token|key|credential/i` and truncates long strings (e.g. 200
chars) — message bodies and card descriptions are summarised by length, not
stored in full.

## Panel UI

All Tailwind/shadcn, tokens only, per the CSS architecture rules.

1. **Consent page — `/oauth/authorize`** (outside `AppShell`, like `/login`).
   Not signed in → `/login?next=…` and back (`next` support is new; accept only
   same-origin relative paths so it is not an open redirect). Member → "MCP access is available to
   panel administrators only." Shows: client name with an *Unverified* badge,
   redirect host in full, the WP Launcher instance it is connecting to, scope
   checkboxes with plain-language descriptions (destructive powers called out),
   Approve / Deny. Deny redirects with `error=access_denied`. The decision POST
   carries the normal staff cookie and passes the existing CSRF check.
2. **Account → Connected apps.** One row per grant: client name, redirect host,
   scopes, authorised date, last used, Revoke; plus **Revoke all**, and the
   user's **agent activity log** (paginated audit rows, filterable by app and
   outcome). Visible only when `mcp` is on.
3. **Settings → AI agents (MCP)** (owner/admin): the MCP URL with copy button,
   short per-client setup steps (Claude.ai connector, Claude Code
   `claude mcp add --transport http …`, ChatGPT), and a warning when
   `PUBLIC_URL` is not public HTTPS ("only local agents such as Claude Code can
   reach this install"). For the **owner only**, a list of every staff user's
   grants (user, app, scopes, last used) with Revoke — but not their audit
   rows.

**Visibility across staff (my call):** grants and audit logs are per user,
matching Mini CRM's per-user scoping — one admin never reads another's agent
activity, whose redacted arguments would include CRM data. The single
exception is that the owner can see and revoke any grant, so a departed
colleague's agent can be cut off.
4. **Features:** `mcp` appears in the admin-only list with a description.

## Origin and Host validation

`/api/mcp` is exempt from `csrfProtection`, and CORS does not stand in for
it. CORS only governs what a browser lets a page *read*, not what reaches the
server. So `/api/mcp` gets its own validation, mounted **before** bearer
authentication and tested independently of it:

**Origin**
- **Absent → allowed.** Server-side clients (the Claude.ai and ChatGPT
  backends, Claude Code, Desktop) send no `Origin`. The bearer token is still
  required.
- **Present and in the allowlist → allowed.** The allowlist is the
  `PUBLIC_URL` origin plus `MCP_ALLOWED_ORIGINS` (a new, comma-separated env
  var, empty by default) for browser-based MCP clients the operator chooses to
  trust (e.g. an inspector at `http://localhost:6274` during development).
- **Present and anything else → 403**, with a JSON-RPC error body that has no
  `id`, as the transport spec requires. That includes `null` and every
  `*.BASE_DOMAIN` origin. Demo sites are untrusted siblings, the same
  reasoning `csrf.ts` already documents.

**Host** (DNS-rebinding defence)
- `Host` must be the `PUBLIC_URL` host, or `api.${BASE_DOMAIN}` on standalone
  deployments. Behind nginx, `Host` is forwarded as `$host`, so this holds.
- On a local deployment (`utils/deployment.ts` says local), also accept
  `localhost`, `127.0.0.1` and `[::1]` on the configured port. Anything else
  gets **403**. This is the case that matters most: a local install is exactly
  what DNS rebinding targets.

**Test independence.** A bad `Origin` gets 403 *with* a valid token and 403
*without* one, never 401, which proves the check runs first. A good `Origin`
with no token gets 401. A request with no `Origin` and a valid token gets 200.
The same matrix runs for `Host`.

## Security checklist (for review at the end)

- Agent tokens give no staff identity anywhere outside `/api/mcp`:
  - on `userAuth`-protected endpoints they get **401**;
  - on `optionalUserAuth` endpoints they are treated as **anonymous** (that
    middleware's existing contract for any invalid credential is unchanged),
    and the test asserts `req.userId` stays unset and the response carries
    nothing privileged — e.g. `GET /api/settings` returns the anonymous
    feature map.
  No change to either middleware is expected: an opaque token already fails
  `jwt.verify`. The tests exist to keep it that way.
- Panel JWTs and API keys rejected by `/api/mcp`; cookies ignored there.
- `/api/oauth/token`, `/register`, `/revoke` and `/api/mcp` exempt from
  `csrfProtection` (bearer/public-client endpoints); `/api/oauth/authorize/decision`
  is **not** exempt.
- CORS on the well-known, register and token endpoints allows any origin
  **without credentials** (browser-based clients need them, and they act on
  nothing without a code or token). CORS on `/api/mcp` follows the *Origin
  and Host validation* allowlist, never `*`. It is always without credentials,
  and it exposes `WWW-Authenticate`.
- PKCE S256 enforced; `plain` refused. `state` passed through untouched.
- Exact redirect URI matching; no open redirect from the consent page on error
  (invalid client/redirect → render an error page, never redirect).
- Code single-use, ≤ 60 s; refresh reuse → grant revoked.
- Constant-time comparison on hash lookups is unnecessary (hashes are looked up
  by equality on a SHA-256 of a 256-bit random value), but tokens are never
  logged in plain text.
- Helmet CSP unaffected for the dashboard; the consent page needs no new
  sources.

## Docs

- `guides/mcp.md` — what it is, enabling the feature, connecting each client,
  scopes, revoking, the localhost limitation, troubleshooting.
- `CLAUDE.md` — a section like the Client Portal one: the token boundary, why
  tokens are opaque, the central tool wrapper rule, the deliberately absent
  tools.
- CHANGELOG entry.

## Follow-ups (not this work)

- Enforce `cloning` / `snapshots` / `phpConfig` / `templates` (and the member
  side of `siteExtend`) in the REST API, not just the UI.
- Shared-site access (owner / shared-admin / shared-viewer matrix) across REST
  and MCP together.
- A "log out everywhere" control for panel sessions.

## Acceptance tests and build order

The boundaries come first; the catalogue grows only on top of passing
boundary tests.

**Stage 1 — boundaries, with a minimal catalogue** (`sites_list`, `sites_get`,
`sites_delete` — the step-up test needs one write — and `crm_clients_list`). Every one of these must pass before stage 2:

1. *Token boundary:* MCP access/refresh tokens → 401 on a `userAuth` route,
   anonymous on an `optionalUserAuth` route; panel JWT, API key and the
   `wpl_token` cookie → 401 on `/api/mcp`.
2. *Output safety:* for every read tool, a site row seeded with a known
   `admin_password` and `auto_login_token` — the serialized result (text and
   `structuredContent`) contains neither value. Written as one test iterating
   the registry, so a new tool is covered without anyone remembering to add it.
3. *Revocation:* password change → next call 401; password change between
   approve and redeem → redemption refused; Revoke all with a code pending →
   redemption refused; code replay → grant revoked; refresh reuse → grant
   revoked; demotion to member → 401; `mcp` feature off → 404.
4. *Reach:* a tool on another user's site, and on a site shared with the user,
   answers "Site not found".
5. *Scope and step-up:* a grant with only `sites:read` lists `sites_delete`.
   Calling it returns HTTP **403** with `error="insufficient_scope"` and
   `scope="sites:write"`, not an `isError` tool result. Re-consenting with
   `sites:write` added and retrying succeeds. A feature-off tool is absent from
   `tools/list`, and calling it returns an `isError` result, not a challenge.
   **Ordering combinations:**
   - Missing scope **and** feature off → `isError` business refusal, no 403.
   - Missing scope **and** a 2026 request whose `Mcp-Name` mismatches the body
     → 400 `HeaderMismatch`, no 403.
   - Missing scope **and** an unknown tool name → unknown-tool error, no 403.
   - Missing scope **and** an invalid token → 401, no 403.

   **Fail-closed regressions.** In each case below, the deletion service must
   be **never called**, asserted with a spy on the service, not inferred from
   the response:
   - a read-only token sends a headerless `tools/call` for `sites_delete`, as
     both a 2025-style and a 2026-style request: rejected;
   - a read-only token sends a well-formed `sites_delete` with the middleware
     disabled in the test harness: the wrapper refuses and writes a `denied`
     audit row flagged as a bypass;
   - for every tool in the registry, a call through the SDK handler alone
     (no middleware) with a grant lacking the tool's scope does not execute
     the handler body. Like the output-safety test, this iterates the
     registry, so new tools are covered automatically.
6. *CIMD fetcher:* private, loopback and metadata addresses, redirects,
   oversize bodies, non-HTTPS URLs and a `client_id` mismatch are all refused
   (unit tests with a stubbed resolver).
7. *Protocol generations:* SDK clients speaking **2026-07-28**, **2025-11-25**
   and **2025-06-18** each list tools and call one through the real handler
   with a real token. For the 2025 clients:
   - a headerless `initialize` requesting that version succeeds;
   - a headerless `tools/list` *after* initialisation is rejected with 400;
   - a headerless `initialize` requesting an unsupported version gets
     version negotiation, not acceptance as `2025-03-26`.

   For 2026: a request missing the header is rejected; a header naming an
   unsupported version gets 400 `UnsupportedProtocolVersionError`; an
   `Mcp-Name` that disagrees with the body gets 400 `HeaderMismatch`.

   **Legacy lifecycle sequence.** This runs end to end, with a real token, for
   both **2025-06-18** and **2025-11-25**:
   `initialize` (headerless) → `notifications/initialized` (with header) →
   **202, empty body** → `tools/list` → `tools/call` succeeds. Alongside it:
   - a JSON-RPC response, or a batch, from a legacy client gets 400;
   - a notification on a 2026-07-28 request gets 400;
   - a notification never reaches a tool. With a read-only token, a
     notification body that carries `sites_delete`-shaped params is answered
     without the deletion service being called.
8. *Origin/Host:* the matrix in *Origin and Host validation*, including a
   `*.BASE_DOMAIN` origin and a rebinding-style `Host`.
9. *Refresh atomicity:* two concurrent refreshes with the same token yield at
   most one success, and afterwards the grant is revoked, with no token from
   either request working. A refresh racing a revoke never leaves a usable
   token. An access token minted moments before a revoke fails on its first
   use.

**Stage 2 — the rest of the catalogue**, area by area, each area landing with
its REST-parity and invoice-transition tests.

**Stage 3 — UI, docs, and the manual client-matrix pass.**

## Left to the builder

- Which v2 beta to pin, and whether `@modelcontextprotocol/express` or
  `@modelcontextprotocol/node` is the adapter (decided by Express 4
  compatibility, checked first in Stage 1).
- Exact tool names/grouping inside the rules above.
- Exact rate-limit numbers within the stated intent.
- File layout (suggested: `src/mcp/` for server + tools by area,
  `src/oauth/` for the AS, `routes/oauth.ts`).
- Test strategy details, holding to the repo's TDD practice: OAuth flow
  end-to-end (register → authorize → token → call → refresh → rotate → reuse →
  revoke), boundary tests both directions, and per-area tool-vs-route parity.
