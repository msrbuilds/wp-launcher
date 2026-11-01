# AI agents (MCP)

WP Launcher can act as an **MCP server**, so an AI agent such as Claude or ChatGPT can manage your sites and your Mini CRM for you. You paste one URL into the agent, sign in to your panel, and tick what it may do. No API keys are copied anywhere.

## What an agent can do

| Area | Examples |
|---|---|
| Sites | List, launch from a blueprint, wait until ready, extend, clone, delete, one-time login link, PHP settings, health |
| Snapshots | List, take, restore, delete |
| Mini CRM | Clients, projects, boards (columns, cards, comments), client messages, notifications |
| Invoices | Draft, edit, attach payment methods, **send** a draft, **cancel** an unpaid invoice |
| Platform | Statistics, site logs, users list, WordPress images, blueprints |

An agent works **as you**: it sees only your own sites and your own clients, and it can never do more than you could in the panel.

Some things an agent can never do, whatever you tick:

- Mark an invoice paid, act on one awaiting payment verification, cancel a paid invoice, or accept or reject a payment proof.
- Invite, delete or change the role of users, or change feature flags, settings, branding, SMTP, webhooks or the API key.
- Read site passwords, database credentials or file-store paths.
- Work inside WordPress itself (posts, plugins, WP-CLI). Pair it with a WordPress MCP server for that; the `sites_autologin_link` tool hands over a one-time login.

## Turning it on

1. **Settings → Features → AI agents (MCP)**. It is off by default, and only owners and admins can use it.
2. **Settings → AI agents** shows the URL to paste, for example `https://panel.example.com/api/mcp`.

Cloud-hosted agents (Claude.ai, ChatGPT) connect from the internet, so the panel must be on a **public HTTPS** address. A localhost install works with Claude Code on the same machine only. The settings page warns you when this applies.

## Connecting an agent

- **Claude.ai / Claude Desktop:** Settings → Connectors → Add custom connector, then paste the URL.
- **Claude Code:** `claude mcp add --transport http wp-launcher https://panel.example.com/api/mcp`
- **ChatGPT:** Settings → Connectors → add a custom connector with the URL.

The agent opens a page on your panel. Sign in if asked. You'll see:

- the app's name, marked **Unverified** because apps name themselves;
- the address you'll be sent back to, which is the thing to check: only continue if you started the connection and recognise it;
- a checkbox per permission. Read access is ticked by default. Permissions that can delete or send something are flagged.

### Permissions

| Permission | Allows |
|---|---|
| `sites:read` | Viewing your sites, snapshots, PHP settings and health |
| `sites:write` | Launching, extending, cloning, snapshotting, restoring and deleting sites, plus one-time login links |
| `crm:read` | Viewing clients, projects, boards, invoices, messages and notifications |
| `crm:write` | Changing clients, projects and board cards, and messaging clients |
| `invoices:write` | Drafting invoices, sending drafts, cancelling unpaid invoices |
| `admin:read` | Platform statistics, site logs, users, image builds |
| `admin:write` | Blueprints and WordPress images |

If you approved read-only access and later ask the agent to do something that needs more, it asks your panel for the extra permission (step-up) and you approve again.

## Seeing and revoking access

**Account → Connected AI agents** lists every app you've authorised, with its permissions and when it was last used. **Revoke** cuts one off immediately; **Revoke all** cuts them all, including an approval still in progress. Changing your password or email also disconnects every agent.

**Account → Agent activity** lists every tool your agents called, with the outcome, kept for 90 days. Arguments are summarised and passwords or tokens are never stored.

The **owner** additionally sees every staff member's connected apps under Settings → AI agents and can revoke any of them. Each person's activity stays private to them.

## Browser-based MCP clients

Agents connect server-to-server and need no configuration. If you use a browser-based MCP client, such as an inspector, add its origin to `MCP_ALLOWED_ORIGINS` in `.env` (comma-separated) and restart the API. Demo-site origins are never accepted.

## Troubleshooting

- **The agent says it can't find the server or gets a 404.** Turn the feature on, and check that the URL is your panel's `PUBLIC_URL` followed by `/api/mcp`.
- **"Only local agents can reach this install".** `PUBLIC_URL` is not public HTTPS. Cloud agents need it to be.
- **The agent was disconnected.** You, the owner, a password change or an email change revoked it, or it went unused for 30 days. Connect again.
- **Changing `PUBLIC_URL`** invalidates existing connections, because tokens are bound to the MCP URL. Reconnect the agents afterwards.

## Tested clients

| Client | Registration | Protocol | Result | Tested |
|---|---|---|---|---|
| Claude.ai (published identity) | Client ID Metadata Document | | not yet tested | |
| Claude.ai (register automatically) | Dynamic registration | | not yet tested | |
| Claude Desktop | | | not yet tested | |
| Claude Code | | | not yet tested | |
| ChatGPT | | | not yet tested | |

A client is listed as supported only once it has passed connect → `sites_list` → `sites_delete` (with step-up) → refresh → revoke.
