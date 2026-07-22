# Panel Redesign — Design

**Date:** 2026-07-22
**Status:** Approved, ready for implementation planning

## Goal

Replace the WP Launcher panel's visual design and shell with a soft, rounded,
token-driven interface that supports light and dark themes, and unify the dual route
trees in the same pass. Reference: Dokploy's panel (collapsible grouped sidebar, breadcrumb
topbar, rounded cards with hairline borders).

## Decisions

| Decision | Choice |
|---|---|
| Relationship to plan 4 | Merged — routing unification and redesign happen together |
| Brand colours | One admin-configurable accent; all other colours from theme tokens |
| Scope | Every page, in one project |
| Theme switching | Follow system by default, with a manual override |
| Styling foundation | Tailwind v4 + shadcn/ui |
| Delivery | A single implementation plan, in three phases |

**This reverses a documented convention.** `CLAUDE.md` and the project memory both state
"all dashboard styles in `index.css`, no per-component CSS files, no inline styles". Tailwind
supersedes that. Both must be updated in the final phase so they do not contradict the code.

## Current state

- `packages/dashboard/src/index.css` is 7,464 lines with only 9 CSS variables
- 74 unique hardcoded hex colours in that file
- 226 hardcoded hex colours across `.tsx` files
- 78 inline `style={{ … }}` props
- No dark mode support of any kind
- 7 admin-configurable `color.*` settings injected as CSS custom properties at runtime
- `main.tsx` still forks into `LocalRoutes` / `AgencyRoutes` on `useIsLocalMode()`

The hardcoded colours — not the visual styling — are what makes dark mode impossible today.
Removing them is the bulk of this project.

---

## Section 1: Foundation

### Tailwind v4 + shadcn/ui

Tailwind v4 is CSS-first: the theme is declared in CSS via `@theme` rather than a JS config,
keeping one source of truth for design tokens. It works with the existing Vite 8 setup
without additional plumbing.

New dependencies: `tailwindcss`, `@tailwindcss/vite`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `tailwindcss-animate`, `lucide-react`, and the Radix primitives that the
shadcn components used here depend on.

### Semantic tokens

Colours are referenced only through semantic token pairs, never as hex values in components:

`background`/`foreground`, `card`/`card-foreground`, `popover`/`popover-foreground`,
`primary`/`primary-foreground`, `secondary`/`secondary-foreground`, `muted`/`muted-foreground`,
`accent`/`accent-foreground`, `destructive`/`destructive-foreground`, plus `border`, `input`,
and `ring`.

Two sets are defined: `:root` for light and `.dark` for dark. Because components reference
only tokens, dark mode is a single class toggle rather than hundreds of edits.

### Brand accent

Note the name collision: shadcn's `accent` token is a subtle hover/highlight surface and is
**not** the brand colour. The admin's `color.accent` setting (currently `#fb8500`) maps to
the `primary` token, and is injected at runtime into `--primary` for both themes. `--primary-foreground` is computed from the accent's relative
luminance so button text stays legible whatever colour is chosen.

The other six `color.*` settings are removed from the Branding tab, since neutrals and
surfaces now come from the token sets. Their rows stay in the `settings` table, ignored —
no destructive migration.

### Theme resolution

A `ThemeProvider` stores `light | dark | system` in `localStorage` under `theme`, defaulting
to `system`, and resolves `system` through `matchMedia('(prefers-color-scheme: dark)')`,
reacting to changes. It toggles the `dark` class on `<html>`.

A small blocking script in `index.html` applies the resolved class before first paint, so
loading in dark mode does not flash white.

### Icons

`lucide-react` replaces the hand-written SVG path strings currently held in `AdminLayout`'s
nav array.

---

## Section 2: The shell

### One route tree

`LocalRoutes` and `AgencyRoutes` collapse into a single tree. `useIsLocalMode` and the
`APP_MODE` environment variable are deleted, along with the remaining `config.isLocalMode`
readers in the API (`index.ts`'s update-check heuristic and startup log line).

Panel routes render inside `AppShell` with no `/admin` prefix — there is no non-admin panel.
Old `/admin/*` paths redirect to their new equivalents.

Routes outside the shell: `/login`, `/setup`, `/verify`, and the opt-in demo portal at
`/launch/:blueprint`, which keeps its own public chrome.

### Sidebar

Grouped, with section labels rather than collapsible accordions — the list is short enough
that accordions would only add clicks.

```
PANEL      Overview · Sites · New Site · Blueprints
CLIENTS    Clients · Projects · Invoices          (feature flag: projects)
INSIGHTS   Monitoring · Analytics · Productivity  (feature flags)
SETTINGS   Features · Branding · Team · System
```

Items continue to hide by feature flag and role exactly as they do now. The account menu and
version label pin to the bottom.

A toggle in the topbar switches between the full sidebar and a 64px icon-only rail with hover
tooltips; the choice persists in `localStorage`. Below the `md` breakpoint the sidebar becomes
an overlay drawer, preserving current mobile behaviour in the new styling.

### Topbar

Sidebar toggle, then a breadcrumb reflecting the current route. On the right: the theme
toggle and the account menu. The reference shows server time there; that is not meaningful
for this panel, whereas the active theme is.

### Visual language

- `rounded-xl` on cards and panels, `rounded-lg` on controls
- One hairline `border-border` plus a very soft shadow, rather than heavy elevation
- `p-6` padding on cards
- Muted uppercase micro-labels above stat values
- A status-dot convention for site state
- Content in a `max-w-7xl` container

---

## Section 3: Migration and delivery

### Preflight is deferred

Tailwind's Preflight resets base element styles and would break every page still styled by
`index.css`. The initial setup therefore imports `tailwindcss/theme` and
`tailwindcss/utilities` **without** Preflight, letting both systems coexist during migration.
Preflight is enabled in the final phase, in the same change that removes the last of
`index.css`.

Skipping this makes the application broken throughout the middle of the project.

### Page conversion

For each page: replace prefixed classes (`lp-`, `sl-`, `ft-`, …) with token utilities, delete
its inline `style` props and hardcoded hex values, and swap hand-rolled controls for shadcn
primitives — `Button`, `Card`, `Input`, `Select`, `Dialog`, `Switch`, `Badge`, `Table`,
`Tooltip`, `DropdownMenu`, `Tabs`.

As each page's classes stop being referenced, that block is deleted from `index.css`. The file
shrinks progressively to nothing rather than being removed in one sweep, so a missed reference
surfaces on one page instead of all of them.

### Phases

One plan, three phases, each leaving the application usable:

**Phase A — Foundation and shell.** Tailwind without Preflight, token sets, `ThemeProvider`,
no-flash script, `AppShell` with sidebar and topbar, route merge, `APP_MODE` deleted, accent
wired to `--primary`, Branding tab reduced to a single colour. Existing pages still render via
`index.css` inside the new shell.

**Phase B — Core pages.** Overview, Sites, New Site, Blueprints and the blueprint editor.

**Phase C — Remainder and cleanup.** Clients, Projects, Invoices, Monitoring, Analytics,
Productivity, Sync, the settings tabs, Login, Setup and the portal. Then enable Preflight,
delete `index.css`, and update `CLAUDE.md` and the project memory to describe Tailwind.

### Verification

Playwright and chrome-devtools are available, so verification is done in a real browser rather
than by inspecting build output. For every converted page:

- Screenshot in light and dark themes
- Assert no console errors
- Exercise the theme toggle and the sidebar collapse
- Confirm interactive controls still work (form submit, dialog open, tab switch)

Each phase's done-criteria require browser evidence, not a successful build. Every UI defect in
this project's recent history — a blank panel, a missing login route, a dead `/setup` route —
passed a build and would have been caught by this.

### Risks

**Broad regression surface.** This touches every page. Mitigation: convert one page at a time,
with per-page screenshots in both themes before moving on.

**Stale CSS.** Parts of the 7,464-line stylesheet may target markup that no longer exists.
Mitigation: delete blocks only as their page converts; do not bulk-delete on a global grep.

**Convention reversal.** Contributors following `CLAUDE.md` would write CSS that conflicts with
Tailwind. Mitigation: `CLAUDE.md` and the project memory are updated in Phase C, and the CSS
architecture section is rewritten rather than deleted.

---

## Out of scope

- Changing any API behaviour or data model
- New panel features; this is a visual and structural change only
- Redesigning the WordPress-side mu-plugin UI
- The marketing website in `E:\MSR Builds\Products\WP Launcher\Website`
