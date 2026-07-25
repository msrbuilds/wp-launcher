# Scoped Feature Flags — Design

**Goal:** Separate what the panel operator can do from what a non-admin user who
launches sites can do. Enabled features become admin-only by default; a second,
opt-in set grants a subset of per-site capabilities to members.

**Tech Stack:** Express + better-sqlite3 (API), React + Tailwind/shadcn
(dashboard). No new services or dependencies.

---

## Background: what exists today

- 17 flags live in `settings` as `feature.<key>`, edited from Admin → Features.
- They are enforced by `isFeatureEnabled(key)` — a **role-blind** lookup that is
  **duplicated locally in four route files** (`sites.ts`, `projects.ts`,
  `sync.ts`, `productivity.ts`).
- Roles are `owner`, `admin`, `member`. Members already see only Sites in the nav;
  admin areas are gated by `RequireAdmin`.
- `panel.publicRegistration` and `panel.demoPortalEnabled` control whether
  non-admin users can arrive at all. The `/demo` portal is a showcase that routes
  visitors to `/signup` — there are **no anonymous launches**, so every launch
  belongs to an account with a role.

### Problems

1. **Capabilities leak to members.** Enabling a flag for the operator's own
   staging work also grants it to anyone who signs up and launches a site. There
   is no way to say "I want Adminer; my demo users do not."
2. **The framing is demo-centric.** All 17 `FEATURE_META` descriptions read
   "Allow users to…", but the primary audience is a WordPress developer running
   their own staging/client sites, CRM, and invoices.
3. **Four copies of the gate.** Any change to feature resolution has to be made
   identically in four files, and nothing keeps them in agreement.

## Decisions (from brainstorming)

- **Matrix, not two flat lists.** Grantable capabilities get one toggle per
  audience; admin-only features get a single toggle and no demo variant.
- **Members are always enforced against the demo set** (default: everything off),
  so nothing can leak by accident. The Demo column is only *shown* once
  `publicRegistration` or `demoPortalEnabled` is on, so a solo developer never
  sees it.
- **No data migration.** Existing `feature.<key>` rows keep their meaning as the
  admin set; the demo set is a new namespace that starts empty.
- Classification is by intent (**admin-only** vs **grantable**), not by location.
  `collaborativeSites` is per-site but admin-only, which is why "panel vs site"
  would have been the wrong axis.

---

## Architecture

```
request (role) ─> isFeatureEnabled(key, role) ─> resolveFeature(pure)
                                                   │
        owner/admin ──> feature.<key>               │
        member ──────> feature.demo.<key>           │
                       (admin-only key -> false)    v
                                              allow / 403
```

One resolution path, one catalog. The four duplicated local helpers are replaced
by a shared module — consolidating them is what makes the change safe, since
otherwise four copies must stay in agreement.

## Data model

| Key | Scope | Notes |
|-----|-------|-------|
| `feature.<key>` | owner/admin | Existing rows, meaning unchanged |
| `feature.demo.<key>` | member | New; absent = off |

Admin-only features have no `feature.demo.*` counterpart. Writing one is rejected
rather than silently stored, so the DB never implies a grant that cannot exist.

## Feature classification

**Admin-only (5)** — never available to members:
`projects`, `productivityMonitor`, `siteSync`, `webhooks`, `collaborativeSites`

`collaborativeSites` is admin-only because it invites other users by email, which
is an outbound-mail and access-granting vector that should not sit behind a
self-service signup.

**Grantable (12)** — one toggle per audience:
`cloning`, `snapshots`, `templates`, `customDomains`, `phpConfig`, `siteExtend`,
`sitePassword`, `exportZip`, `healthMonitoring`, `scheduledLaunch`, `adminer`,
`publicSharing`

## Components

### 1. `services/features.service.ts` (new)

The single source of truth:

- `ADMIN_ONLY_FEATURES` and `GRANTABLE_FEATURES` catalogs covering all 17 keys.
- `resolveFeature({ key, role, adminOn, demoOn })` — pure, exhaustively tested.
- `isFeatureEnabled(key, role)` — DB-backed wrapper used by routes.
- `effectiveFeatures(role)` — the full resolved map for a requester, used by the
  settings endpoint.

### 2. Route consolidation

Delete the local `isFeatureEnabled` from `sites.ts`, `projects.ts`, `sync.ts`, and
`productivity.ts`; import the shared one and pass `req.userRole`. Routes that are
already admin-gated resolve as admin, so their behaviour is unchanged.

### 3. `GET /api/settings` becomes role-aware

Today this hands the dashboard every `feature.*` row, so a member's UI is driven
by the admin set — they would see actions the API then refuses. It must return
`effectiveFeatures(role)` for the requester. `SettingsContext` consumes it
unchanged, so member UI hides ungranted actions for free.

### 4. Admin API

- `GET /api/admin/features` → `{ features, demoFeatures, catalog: { adminOnly,
  grantable }, demoColumnVisible }`. Serving the catalog keeps the dashboard from
  hard-coding a second copy of the classification.
- `PUT /api/admin/features` → accepts `{ features, demoFeatures }`. Unknown keys
  are ignored (current behaviour). An admin-only key inside `demoFeatures` is a
  400, not a silent drop.

### 5. Dashboard

- `FeaturesTab`: a two-column matrix for the 12 grantable capabilities, then a
  separate admin-only block for the 5. The Demo column renders only when
  `demoColumnVisible`.
- `FEATURE_META` descriptions rewritten — "Allow users to…" becomes audience-
  neutral wording, since the operator is the primary audience.

## Error handling

- Member requests an ungranted capability → **403**, identical to the response a
  globally disabled feature gives today. No new failure mode for clients.
- Admin-only key submitted under `demoFeatures` → **400** with the offending key.
- A key present in `FEATURE_META` but in neither catalog → caught by a test, not
  at runtime, so a future flag cannot ship unclassified and default to "member
  can use it".

## Testing

- **Unit, `resolveFeature`:** the full matrix — role (owner/admin/member) ×
  `adminOn` × `demoOn` × admin-only-vs-grantable.
- **Unit, catalog integrity:** every `FEATURE_META` key appears in exactly one
  catalog, and the catalogs cover all 17.
- **Unit, PUT validation:** admin-only key in `demoFeatures` rejected; unknown
  keys ignored.
- **Integration:** with `cloning` on for admin and off for demo, an admin request
  succeeds and a member request 403s — the core regression this work exists for.
- **Integration:** `/api/settings` returns different effective maps for an admin
  and a member.

## Out of scope (YAGNI)

Per-user feature overrides beyond role; new capabilities; changes to quotas or
`panel.*` settings; renaming existing flag keys; a separate demo-only blueprint
set.
