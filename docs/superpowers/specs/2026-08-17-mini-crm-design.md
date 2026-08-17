# Mini CRM — Design

**Date:** 2026-08-17
**Status:** Approved, ready for planning

## Problem

The Projects & Invoices feature is a private staff tool. Clients exist only as
rows owned by a staff user: no login, no visibility, no way to respond. Every
exchange about a project's progress or an invoice's payment happens outside the
product, so the record of it lives in someone's inbox.

This turns that feature into **Mini CRM**: clients get their own dashboard,
projects get a board that tracks work rather than just naming it, and invoices
carry the payment information and proof-of-payment trail that currently travels
by email.

## Already built — not in scope

Two of the requested invoice capabilities exist today. Neither needs work, and
the plan must not rebuild them:

- **Per-invoice currency.** `invoices.currency` is a column, the invoice dialog
  has a Currency field (`InvoicesPage.tsx:356`), and it renders in the list.
- **Invoice status changes.** `changeStatus()` (`InvoicesPage.tsx:151`) calls
  `PATCH /api/projects/invoices/:id/status`, which enforces
  draft → sent → paid and any → cancelled.

What this design adds around them is the `awaiting_verification` status and the
payment-method attachment described below.

## Deployment model

A panel is normally run by **one admin — a freelancer or a small studio owner —
who manages client projects and launches the client sites themselves.**

The `member` role is not a colleague. Members are the public: people who launch
temporary demo sites to try a plugin or a blueprint, when the operator chooses
to open registration at all. They have no CRM access and never will.

Three consequences run through the decisions below:

- Anything that only makes sense with a second staff member is dead weight. The
  board's assignee field was cut for exactly this reason.
- "The staff user who owns this client" resolves to the operator. Notification
  routing needs no logic.
- **Sites linked to projects are the ones the operator launched.** Public demo
  sites belong to their own launcher and stay out of the project picker, which
  is the desired behaviour rather than a limitation — a client's project should
  not list a stranger's plugin test.

## Goals

- Clients sign in and see their own projects, invoices and conversation.
- Projects are managed on a board with columns, cards, dates and labels — with
  per-column control over what clients see.
- Invoices carry admin-defined payment methods, chosen per invoice.
- Clients submit proof of payment; staff verify or reject it.
- Staff and clients hold one conversation per client, in the product.
- Notification volume is controllable per recipient.

## Non-goals

- **Online payment collection.** No Stripe, PayPal API or card processing. The
  product records payment *claims* and their verification, not money movement.
- **Client self-registration.** Portal accounts are created by invitation only.
- **Currency conversion.** An invoice has one currency; nothing converts between
  them or maintains rates.
- **Time tracking or billing by hour.**
- **A general-purpose notification centre** beyond what the message, proof and
  card-comment flows need.

## Decisions

Each was chosen deliberately; the rationale matters more than the choice.

### Client authentication: separate identity, scoped token

Clients get their own `client_users` table and a JWT carrying `scope: 'client'`.
They are **not** a new role on `users`.

The reason is concrete. `features.service.ts` resolves any non-privileged role
through the *member* namespace, and members may launch demo sites. A `client`
role would therefore inherit permissions by default and be denied only where
someone remembered to check — on an application that provisions Docker
containers. A separate identity fails closed instead.

Two rules follow, both deny-by-default:

1. **Staff middleware rejects any client-scoped token on the claim**, not on the
   role. A panel endpoint added later without a guard is still unreachable by a
   client.
2. **Portal queries derive `client_id` from the token, never from a request
   parameter.** There is no `?clientId=` anywhere in `/api/portal/*`. The usual
   way a portal leaks is an identifier that looks validated and isn't.

### Staff visibility: per-user scoping retained — considered and dropped

Every CRM endpoint passes `req.userId` and filters `user_id = ?`, with no
privileged override, so one admin cannot see another's clients. **This stays as
it is.**

It was designed and fully implemented as a privileged override — owner and admin
seeing every row — and then dropped before merge, deliberately. The reason is
the deployment model above: with a single operator, the set of rows they created
and the set of all rows are the same, so the change was **inert**. It added a
`CrmActor` parameter to twenty-four functions, an `ownerFilter` helper and
roughly twenty tests, in exchange for behaviour no user of a one-person panel
could observe. Carrying that indefinitely to serve a second admin who does not
exist is the cost this spec's non-goals exist to refuse.

Two things follow for later phases, and both matter:

- **A client's records belong to exactly one staff user**, so the portal's
  ownership chain is `client_user → client → clients.user_id`, and that last
  hop resolves to the operator. Nothing in the portal needs a privileged
  override.
- **If a second staff member is ever added**, this decision must be revisited
  before they are given CRM access, or they will see an empty CRM and be unable
  to cover for anyone. The implementation is preserved on the abandoned
  `feat/mini-crm-phase-0` branch rather than being rewritten from scratch.

**Members have no CRM access at all**, and none of this changes that. `projects`
is listed in `ADMIN_ONLY_FEATURES`, so `isFeatureEnabled('projects', 'member')`
is false by construction and every CRM route answers 403.

### Board depth

Columns and cards, drag to reorder and move, plus due date and colour labels.
Card discussion is a separate feature (below) rather than an inline field.

**No assignee field.** Cards carry no `assignee_user_id`. Members cannot reach
the CRM, so the only possible assignee is another admin — and the deployment
model above says there usually isn't one. The control would render a dropdown
containing the operator's own name on every card: clutter presenting itself as a
feature. Add it if and when a second staff member exists.

**Card ordering uses integer `position`, rewritten for the affected columns
inside a transaction on each move.** Fractional positions avoid the rewrite but
accumulate precision debt and need rebalancing; a board holds tens of cards, and
the simple approach is always correct at that size.

**Drag-and-drop adds `@dnd-kit/core` and `@dnd-kit/sortable`.** The project has
no DnD library. Native HTML5 drag events would avoid the dependency but are not
keyboard-operable, which would make the board unusable without a mouse.

### Board visibility to clients: per column, hidden by default

Each column carries `client_visible`, defaulting to 0. Staff keep an internal
column without thinking about it, and forgetting the toggle hides too much
rather than leaking. Per-card visibility was rejected as fiddly and easy to get
wrong in exactly the direction that exposes something.

### Payment methods: label plus free-form instructions

A method is a label, a multiline instructions block the admin formats
themselves, an active flag and a sort order. This handles IBANs, wallet
addresses and payment links equally, and never blocks a method nobody
anticipated. Typed per-method fields would render more neatly at roughly four
times the UI cost and still not cover every case.

Methods are **install-wide**, managed by owner/admin. Members attach them to
invoices but do not create them: they are the business's bank details, not a
personal setting.

**Attachment is opt-in per invoice, stored in a join table, and absence means
hidden.** Adding a method later therefore never retroactively alters an invoice
already sent.

### Payment proofs: a distinct invoice status

Uploading a proof moves the invoice to `awaiting_verification`. Staff accept
(→ `paid`) or reject with a reason (→ `sent`).

Auto-marking an invoice paid on upload was rejected: any client could clear
their own balance with any file, and the books would then record claims rather
than confirmed payments. Recording the proof while leaving the status untouched
was also rejected — it gives staff no queue, so a proof is only discovered by
opening the invoice that happens to have one.

### Communications: one thread per client

A single chronological conversation per client. Any message may reference a
project or invoice, shown as a chip; composing from those pages pre-fills the
reference. Per-project and per-invoice threads were rejected: they need thread
lists, per-thread unread state, and force the client to choose where to write.

### Card comments: staff-only

Clients see cards in visible columns but cannot comment; they raise things in
their client thread. This keeps one client-facing conversation — client input
cannot be stranded in a card nobody rechecks, or in a column later hidden — and
lets card comments stay a frank internal record.

### Two message tables, shared infrastructure

`client_messages` and `card_comments` stay separate tables rather than merging
into one polymorphic `messages` table. SQLite cannot enforce a foreign key on a
polymorphic target, and these two have different audiences, permissions and
notification rules.

What genuinely repeats is extracted instead:

- **A file-store module** — magic-byte validation, size caps, data-volume paths
  and authenticated serving — used by payment proofs *and* card attachments.
- **A notification helper**, used by both message types and by proof events.

The remaining duplication is "insert a row, notify someone", which is cheap.

### Notifications: immediate first, digests as their own phase

Communications ships with immediate email. Digests are a cross-cutting
subsystem — a `notifications` table with pending/sent state, a per-recipient
preference, and a cron job to aggregate — so they land separately and retrofit
the preference rather than blocking the conversation feature.

## Data model

### New tables

| Table | Columns |
|---|---|
| `client_users` | `id`, `client_id` → clients, `email` (unique), `password_hash`, `verified`, `invite_token`, `invite_expires_at`, `token_version`, `last_login_at`, `created_at` |
| `payment_methods` | `id`, `label`, `instructions`, `active`, `sort_order`, `created_at`, `updated_at` |
| `invoice_payment_methods` | `invoice_id` → invoices, `payment_method_id` → payment_methods, primary key on both |
| `payment_proofs` | `id`, `invoice_id`, `client_user_id`, `storage_path`, `original_name`, `mime`, `size_bytes`, `amount`, `note`, `status` (pending/accepted/rejected), `reviewed_by`, `reviewed_at`, `reject_reason`, `created_at` |
| `board_columns` | `id`, `project_id` → projects, `name`, `position`, `client_visible` (default 0), `created_at` |
| `board_cards` | `id`, `project_id`, `column_id` → board_columns, `title`, `description`, `position`, `due_date`, `labels` (JSON array), `created_at`, `updated_at` |
| `card_comments` | `id`, `card_id` → board_cards, `author_id` → users, `body`, `created_at` |
| `card_attachments` | `id`, `card_id` → board_cards, `storage_path`, `original_name`, `mime`, `size_bytes`, `uploaded_by`, `created_at` |
| `client_messages` | `id`, `client_id` → clients, `author_type` (staff/client), `author_id`, `body`, `project_id` (nullable), `invoice_id` (nullable), `created_at` |
| `notifications` | `id`, `recipient_type` (staff/client), `recipient_id`, `kind`, `subject`, `body`, `link`, `created_at`, `sent_at` (null = pending) |
| `notification_prefs` | `recipient_type`, `recipient_id`, `mode` (immediate/daily/off), primary key on the first two. **A missing row means `immediate`** — nobody is silently opted out of hearing about their own invoices |

`board_cards.project_id` is denormalised alongside `column_id` so a card can be
scoped to a project — and to a client — without joining through its column on
every permission check.

### Changes to existing tables

- `invoices.status` gains `awaiting_verification`.
- No column changes elsewhere. Staff visibility is a query change in
  `project.service.ts`, not a schema change.

All new tables and the status value are added by `initSchema` using the existing
`CREATE TABLE IF NOT EXISTS` and try/catch `ALTER TABLE` pattern, so an existing
install migrates on boot.

## Interfaces

### Portal API — `/api/portal/*`, client-scoped token

- `POST /auth/accept-invite` — token → set password
- `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `GET /projects`, `GET /projects/:id` — includes client-visible columns and
  their cards only
- `GET /invoices`, `GET /invoices/:id` — includes attached payment methods
- `POST /invoices/:id/proofs`, `GET /proofs/:id/file`
- `GET /messages`, `POST /messages`
- `GET|PUT /notification-pref`

### Panel API additions

The prefix stays `/api/projects/*` throughout. "Mini CRM" is the product name,
not a route change: a second `/api/crm/*` prefix would leave the same feature
answering on two paths for no gain.

- `GET|POST|PUT|DELETE /api/projects/payment-methods` — owner/admin only
- `PUT /api/projects/invoices/:id/payment-methods` — set the attached list
- `GET /api/projects/invoices/:id/proofs`, `POST /proofs/:id/accept`,
  `POST /proofs/:id/reject`
- `POST /api/projects/clients/:id/portal-invite` — create or re-send an invite
- Board: `GET|POST|PUT|DELETE` for columns and cards, plus
  `POST /api/projects/:id/board/reorder`
- `GET|POST /api/projects/cards/:id/comments`,
  `GET|POST|DELETE /api/projects/cards/:id/attachments`
- `GET|POST /api/projects/clients/:id/messages`

### File store

One module serving payment proofs and card attachments:

- Accepts PNG, JPEG, WebP and PDF; 5 MB cap.
- **Validates by magic bytes, not the declared MIME type**, which is
  client-supplied.
- Writes under `data/` — never the checkout, which Dokploy wipes on redeploy.
- Serves only through an authenticated route. A guessable public URL for
  payment documents is a leak nobody notices.

## Phases

Each phase gets its own implementation plan, branch and review.

| # | Phase | Depends on | Notes |
|---|---|---|---|
| 0 | Mini CRM rename; owner/admin see all CRM rows | — | Flag keeps its stored key `feature.projects`; only the label changes, so existing settings rows survive |
| 1 | Payment methods and per-invoice attachment | — | Ships value with no client-facing surface |
| 2 | Client identity, portal shell, read-only projects and invoices | — | The security-critical phase |
| 3 | Payment proofs and verification | 1, 2 | Introduces the file store |
| 4 | Communications, immediate email | 2 | |
| 5 | Project board | client view needs 2 | Largest build; independent, so it may move earlier |
| 6 | Card comments and attachments | 5 | Reuses the file store from 3 |
| 7 | Notifications and digests | 4 | Retrofits preferences over immediate sending |

The portal is behind its own feature flag, `feature.clientPortal`, off by
default, so an install can run Mini CRM with no client-facing surface at all.
It is admin-only in the sense of `features.service.ts` — there is no member
counterpart, because it governs whether outside parties can sign in.

Portal invitations reuse the shape of the existing user verification flow: a
single-use `invite_token` valid for **72 hours**, re-issued by re-inviting.
Accepting sets a password and marks the account verified.

## Testing

### Provable in CI

- **Cross-client isolation.** Two clients, each with a project, invoice, proof
  and thread; assert every portal endpoint refuses the other's records. This is
  the highest-value test in the design.
- **Staff routers reject client-scoped tokens.** A test that enumerates the
  mounted staff routers and asserts a client token is rejected by each, so an
  endpoint added later without a guard fails the suite rather than leaking.
- **Invoice status transitions**, including every path in and out of
  `awaiting_verification`.
- **File validation** over crafted buffers: a PDF renamed `.png`, a PNG with a
  falsified MIME type, a file one byte over the cap.
- **Board reordering** — moving a card within and between columns leaves both
  columns' positions contiguous and correctly ordered.
- **Payment-method attachment** — an invoice with no rows in the join table
  shows no methods, and adding a method afterwards does not change it.
- **Digest aggregation** — pending notifications for one recipient collapse into
  a single email; `off` sends nothing; `immediate` leaves nothing pending.

### Requires a real host

Per phase, added to the guides:

1. A client accepts an invite, sets a password and signs in.
2. That client sees only their own projects and invoices.
3. A proof uploads, the invoice moves to `awaiting_verification`, and accepting
   it marks the invoice paid.
4. A proof URL is not retrievable while signed out.
5. Cards drag between columns, by mouse and by keyboard, and the order survives
   a reload.
6. A client sees cards from visible columns only; toggling a column off removes
   them.
7. Messages deliver email in both directions; a daily digest arrives once.

Items 2 and 4 are the ones that fail silently — nothing in the UI announces that
a client can read a record they shouldn't.

## Risks

- **A client token reaching a staff endpoint.** Mitigated by rejecting on the
  claim rather than the role, plus the router-enumeration test.
- **Phase 0 widens visibility.** An admin begins seeing clients created by
  *another admin or the owner*. Intended, but existing installs will notice; it
  goes in the upgrade notes. Members are unaffected — they have no CRM access
  either way.
- **Proof files are financial documents.** Authenticated serving, magic-byte
  validation, stored outside the checkout.
- **The portal shares the panel's origin**, so it must inherit the existing CSRF
  handling and rate limits rather than define its own.
- **A new invoice status can break existing filters.** The status list is
  rendered from a single source and covered by transition tests.

## Follow-up work

- **Online payment collection.** The payment-method model deliberately stops at
  instructions. Adding a gateway later would extend it rather than replace it.
- **In-app notification centre.** The `notifications` table makes this mostly a
  UI exercise once phase 7 lands; not built here.
