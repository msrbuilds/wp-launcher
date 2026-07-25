# Panel Redesign — Phase A: Foundation and Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Tailwind v4 with light/dark semantic tokens, build the new collapsible panel shell, and merge the dual route trees — leaving every existing page working inside the new shell.

**Architecture:** Tailwind is imported *without* Preflight so the 7,464-line `index.css` keeps styling unconverted pages during migration. A `ThemeProvider` resolves `light | dark | system` and toggles `.dark` on `<html>`, with a blocking script preventing a flash on load. `AppShell` replaces both `AdminLayout` and `App.tsx` as the panel frame, and `main.tsx` drops its `isLocal` fork.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, shadcn/ui (Radix + CVA), lucide-react, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-22-panel-redesign-design.md`

**Scope:** Phase A of three. Phase B (core pages) and Phase C (remaining pages, Preflight, deleting `index.css`) are written after this lands, against the real token vocabulary this creates.

---

## Prerequisites

This plan assumes `feat/blueprints` is merged to `main`. It builds on the Blueprints page and
`blueprint_id` vocabulary that branch introduced. Merge it first, or the sidebar's Blueprints
entry points at a page that does not exist.

---

## What the code looks like now

1. **`packages/dashboard/src/index.css` is 7,464 lines** with 9 CSS variables and 74 unique
   hardcoded hex colours. It must keep working untouched through this phase.
2. **226 hardcoded hex colours and 78 inline `style={{ … }}` props** live in `.tsx` files.
   Phase A does not remove these except in files it rewrites outright.
3. **`main.tsx` forks** on `useIsLocalMode()` into `LocalRoutes` / `AgencyRoutes`.
4. **`AdminLayout.tsx` (226 lines)** holds the sidebar, its nav array with inline SVG path
   strings, the auth guards, and `AdminHeadersContext`. The guards and context must survive;
   the chrome is replaced.
5. **`App.tsx`** is the public-portal chrome after plan 2. It stays, restyled later in Phase C.
6. **Dashboard has no test runner.** Vitest is added here for the pure logic this phase adds.

---

## File Structure

**Create:**
- `packages/dashboard/src/styles/theme.css` — Tailwind imports (no Preflight) + token sets
- `packages/dashboard/src/lib/utils.ts` — `cn()` class merger
- `packages/dashboard/src/lib/theme.ts` — pure theme-resolution logic
- `packages/dashboard/src/lib/theme.test.ts`
- `packages/dashboard/src/context/ThemeContext.tsx` — provider + `useTheme`
- `packages/dashboard/src/components/shell/AppShell.tsx` — frame + guards
- `packages/dashboard/src/components/shell/Sidebar.tsx` — grouped nav, rail, drawer
- `packages/dashboard/src/components/shell/Topbar.tsx` — breadcrumb, theme toggle, account
- `packages/dashboard/src/components/shell/nav-items.ts` — nav definition
- `packages/dashboard/src/components/ui/*` — shadcn primitives (via CLI)
- `packages/dashboard/components.json` — shadcn config
- `packages/dashboard/vitest.config.ts`

**Modify:**
- `packages/dashboard/package.json` — dependencies, `test` script
- `packages/dashboard/vite.config.ts` — Tailwind plugin
- `packages/dashboard/index.html` — no-flash script
- `packages/dashboard/src/main.tsx` — single route tree, ThemeProvider
- `packages/dashboard/src/context/SettingsContext.tsx` — accent → `--primary`
- `packages/dashboard/src/pages/admin/AdminLayout.tsx` — reduced to guards + context
- `packages/dashboard/src/pages/admin/BrandingTab.tsx` — one colour field
- `packages/api/src/config.ts`, `packages/api/src/index.ts` — delete `APP_MODE`
- `docker-compose.yml` — delete `APP_MODE`

---

## Task 1: Tailwind without Preflight

**Files:**
- Modify: `packages/dashboard/package.json`, `packages/dashboard/vite.config.ts`
- Create: `packages/dashboard/src/styles/theme.css`

- [ ] **Step 1: Install**

```bash
npm install -D tailwindcss @tailwindcss/vite -w packages/dashboard
npm install class-variance-authority clsx tailwind-merge lucide-react -w packages/dashboard
```

- [ ] **Step 2: Add the Vite plugin**

In `packages/dashboard/vite.config.ts`, add the import and register the plugin:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiPort = process.env.API_PORT || '3737';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4000,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create the token stylesheet**

Create `packages/dashboard/src/styles/theme.css`. The three `@import` lines deliberately omit
`tailwindcss/preflight.css` — Preflight would reset base element styles and break every page
still rendered by `index.css`. It is enabled in Phase C when `index.css` is deleted.

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);

/* Tell Tailwind that `dark` is a class, not a media query, so the provider controls it. */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.21 0.03 265);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.21 0.03 265);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.21 0.03 265);
  --primary: oklch(0.72 0.17 55);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.97 0.005 265);
  --secondary-foreground: oklch(0.21 0.03 265);
  --muted: oklch(0.97 0.005 265);
  --muted-foreground: oklch(0.55 0.02 265);
  --accent: oklch(0.97 0.005 265);
  --accent-foreground: oklch(0.21 0.03 265);
  --destructive: oklch(0.58 0.22 27);
  --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(0.92 0.006 265);
  --input: oklch(0.92 0.006 265);
  --ring: oklch(0.72 0.17 55);
  --radius: 0.75rem;
}

.dark {
  --background: oklch(0.19 0.02 265);
  --foreground: oklch(0.97 0.005 265);
  --card: oklch(0.23 0.02 265);
  --card-foreground: oklch(0.97 0.005 265);
  --popover: oklch(0.23 0.02 265);
  --popover-foreground: oklch(0.97 0.005 265);
  --primary: oklch(0.72 0.17 55);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.28 0.02 265);
  --secondary-foreground: oklch(0.97 0.005 265);
  --muted: oklch(0.28 0.02 265);
  --muted-foreground: oklch(0.68 0.02 265);
  --accent: oklch(0.28 0.02 265);
  --accent-foreground: oklch(0.97 0.005 265);
  --destructive: oklch(0.62 0.2 27);
  --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(0.31 0.02 265);
  --input: oklch(0.31 0.02 265);
  --ring: oklch(0.72 0.17 55);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}
```

- [ ] **Step 4: Import it before the legacy stylesheet**

In `packages/dashboard/src/main.tsx`, add above the existing `import './index.css';`:

```tsx
import './styles/theme.css';
```

Order matters: `index.css` must win any conflict during migration, so it is imported last.

- [ ] **Step 5: Verify both stylesheets coexist**

```bash
npm run build -w packages/dashboard
```
Expected: builds with no errors.

```bash
npm run dev:dashboard
```
Open `http://localhost:4000`. Expected: the panel looks **exactly as it does today** — Tailwind
is present but no utilities are used yet, and Preflight is absent so nothing is reset. If
anything looks different, Preflight was imported by mistake; re-check Step 3.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/package.json packages/dashboard/vite.config.ts packages/dashboard/src/styles/theme.css packages/dashboard/src/main.tsx package-lock.json
git commit -m "build(dashboard): add tailwind v4 with light/dark tokens, without preflight"
```

---

## Task 2: Test runner and the class merger

**Files:**
- Create: `packages/dashboard/vitest.config.ts`, `packages/dashboard/src/lib/utils.ts`, `packages/dashboard/src/lib/utils.test.ts`
- Modify: `packages/dashboard/package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^3.0.0 -w packages/dashboard
```

- [ ] **Step 2: Add the test script**

In `packages/dashboard/package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config**

Create `packages/dashboard/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `packages/dashboard/src/lib/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });

  it('lets a later tailwind class win over an earlier conflicting one', () => {
    expect(cn('p-2', 'p-6')).toBe('p-6');
    expect(cn('text-muted-foreground', 'text-foreground')).toBe('text-foreground');
  });

  it('keeps non-conflicting utilities', () => {
    expect(cn('rounded-xl border', 'p-6')).toBe('rounded-xl border p-6');
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test -w packages/dashboard`
Expected: FAIL — `Failed to resolve import "./utils"`.

- [ ] **Step 6: Implement**

Create `packages/dashboard/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Join class names, letting later Tailwind utilities override earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -w packages/dashboard`
Expected: PASS — 4 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/vitest.config.ts packages/dashboard/src/lib packages/dashboard/package.json package-lock.json
git commit -m "test(dashboard): add vitest and the cn class merger"
```

---

## Task 3: Theme resolution

**Files:**
- Create: `packages/dashboard/src/lib/theme.ts`, `packages/dashboard/src/lib/theme.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/dashboard/src/lib/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { THEME_STORAGE_KEY, isThemeChoice, resolveTheme, nextTheme } from './theme';

describe('isThemeChoice', () => {
  it('accepts the three valid choices', () => {
    expect(isThemeChoice('light')).toBe(true);
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('system')).toBe(true);
  });

  it('rejects anything else, including junk from localStorage', () => {
    expect(isThemeChoice('blue')).toBe(false);
    expect(isThemeChoice('')).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('returns an explicit choice unchanged, whatever the system says', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system preference when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('cycles light to dark to system and back', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });
});

describe('THEME_STORAGE_KEY', () => {
  it('matches the key the no-flash script in index.html reads', () => {
    expect(THEME_STORAGE_KEY).toBe('wpl-theme');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w packages/dashboard`
Expected: FAIL — `Failed to resolve import "./theme"`.

- [ ] **Step 3: Implement**

Create `packages/dashboard/src/lib/theme.ts`:

```ts
export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Also hardcoded in the no-flash script in index.html. That script runs before
 * any module loads, so it cannot import this constant — the test asserts the
 * two stay in step.
 */
export const THEME_STORAGE_KEY = 'wpl-theme';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  if (choice === 'light') return 'dark';
  if (choice === 'dark') return 'system';
  return 'light';
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w packages/dashboard`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/lib/theme.ts packages/dashboard/src/lib/theme.test.ts
git commit -m "feat(dashboard): add theme resolution logic"
```

---

## Task 4: Theme provider and no-flash script

**Files:**
- Create: `packages/dashboard/src/context/ThemeContext.tsx`
- Modify: `packages/dashboard/index.html`, `packages/dashboard/src/main.tsx`

- [ ] **Step 1: Add the blocking script**

In `packages/dashboard/index.html`, add as the last element inside `<head>`:

```html
    <script>
      // Applies the theme class before first paint so loading in dark mode
      // does not flash white. Kept inline and dependency-free on purpose.
      (function () {
        try {
          var stored = localStorage.getItem('wpl-theme');
          var choice = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
          var dark = choice === 'dark' ||
            (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
          document.documentElement.classList.toggle('dark', dark);
        } catch (e) {
          /* private mode or storage disabled — fall back to light */
        }
      })();
    </script>
```

- [ ] **Step 2: Create the provider**

Create `packages/dashboard/src/context/ThemeContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import {
  THEME_STORAGE_KEY,
  isThemeChoice,
  resolveTheme,
  nextTheme,
  type ThemeChoice,
  type ResolvedTheme,
} from '../lib/theme';

interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  choice: 'system',
  resolved: 'light',
  setTheme: () => {},
  cycleTheme: () => {},
});

function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Track the OS preference so `system` stays live rather than snapshotting at mount.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(choice, systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage disabled — the choice still applies for this session */
    }
  }, []);

  const cycleTheme = useCallback(() => setTheme(nextTheme(choice)), [choice, setTheme]);

  return (
    <ThemeContext.Provider value={{ choice, resolved, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
```

- [ ] **Step 3: Wrap the app**

In `packages/dashboard/src/main.tsx`, add the import:

```tsx
import { ThemeProvider } from './context/ThemeContext';
```

and wrap `SettingsProvider` so the theme applies regardless of settings loading:

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 4: Verify in the browser**

```bash
npm run build -w packages/dashboard && docker compose build --no-cache dashboard && docker compose up -d dashboard
```

Then in a browser console at `http://localhost`:

```js
localStorage.setItem('wpl-theme','dark'); location.reload();
```
Expected: `document.documentElement.classList.contains('dark')` is `true` immediately on load,
with no white flash. Repeat with `'light'` and confirm the class is absent.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/index.html packages/dashboard/src/context/ThemeContext.tsx packages/dashboard/src/main.tsx
git commit -m "feat(dashboard): add theme provider with no-flash bootstrap"
```

---

## Task 5: shadcn primitives

**Files:**
- Create: `packages/dashboard/components.json`, `packages/dashboard/src/components/ui/*`

- [ ] **Step 1: Create the shadcn config**

Create `packages/dashboard/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/theme.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 2: Add the `@` path alias**

In `packages/dashboard/vite.config.ts`, add the import and `resolve` block:

```ts
import path from 'path';
```

```ts
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
```

In `packages/dashboard/tsconfig.json`, add inside `compilerOptions`:

```json
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 3: Add the primitives this phase needs**

```bash
cd packages/dashboard
npx shadcn@latest add button dropdown-menu tooltip separator sheet scroll-area
```

Accept overwriting `src/lib/utils.ts` if prompted — the generated version is the same `cn`
implementation the tests in Task 2 cover.

- [ ] **Step 4: Verify the build and tests still pass**

```bash
npm run build -w packages/dashboard
npm test -w packages/dashboard
```
Expected: builds clean, 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/components.json packages/dashboard/src/components/ui packages/dashboard/vite.config.ts packages/dashboard/tsconfig.json packages/dashboard/package.json package-lock.json
git commit -m "build(dashboard): add shadcn primitives for the shell"
```

---

## Task 6: Navigation definition

**Files:**
- Create: `packages/dashboard/src/components/shell/nav-items.ts`
- Test: `packages/dashboard/src/components/shell/nav-items.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/dashboard/src/components/shell/nav-items.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildNavGroups } from './nav-items';

const allFeatures = {
  projects: true,
  productivityMonitor: true,
  healthMonitoring: true,
  siteSync: true,
};

describe('buildNavGroups', () => {
  it('always shows the panel group', () => {
    const groups = buildNavGroups({}, 'member');
    const panel = groups.find((g) => g.label === 'Panel');
    expect(panel?.items.map((i) => i.to)).toEqual(['/', '/sites', '/sites/new', '/blueprints']);
  });

  it('hides the clients group unless the projects feature is on', () => {
    expect(buildNavGroups({}, 'owner').find((g) => g.label === 'Clients')).toBeUndefined();
    expect(buildNavGroups(allFeatures, 'owner').find((g) => g.label === 'Clients')).toBeDefined();
  });

  it('hides productivity unless its feature is on', () => {
    const groups = buildNavGroups({ healthMonitoring: true }, 'owner');
    const insights = groups.find((g) => g.label === 'Insights');
    expect(insights?.items.some((i) => i.to === '/productivity')).toBe(false);
  });

  it('hides the settings group from members', () => {
    expect(buildNavGroups(allFeatures, 'member').find((g) => g.label === 'Settings')).toBeUndefined();
    expect(buildNavGroups(allFeatures, 'admin').find((g) => g.label === 'Settings')).toBeDefined();
    expect(buildNavGroups(allFeatures, 'owner').find((g) => g.label === 'Settings')).toBeDefined();
  });

  it('drops a group entirely when every item in it is hidden', () => {
    const groups = buildNavGroups({}, 'owner');
    expect(groups.find((g) => g.label === 'Insights')).toBeUndefined();
  });

  it('gives every item a stable key and an icon', () => {
    for (const group of buildNavGroups(allFeatures, 'owner')) {
      for (const item of group.items) {
        expect(item.to.startsWith('/')).toBe(true);
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.icon).toBeTruthy();
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w packages/dashboard`
Expected: FAIL — `Failed to resolve import "./nav-items"`.

- [ ] **Step 3: Implement**

Create `packages/dashboard/src/components/shell/nav-items.ts`:

```ts
import {
  LayoutDashboard, Globe, Plus, Layers,
  Users, FolderKanban, Receipt,
  Activity, BarChart3, Timer,
  RefreshCw, ToggleLeft, Palette, UserCog, Server,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

type Features = Record<string, boolean | undefined>;

const PRIVILEGED = new Set(['owner', 'admin']);

/**
 * Visibility is decided by feature flags and role only — there is no longer a
 * mode. A group with no visible items is omitted rather than rendered empty.
 */
export function buildNavGroups(features: Features, role: string | undefined): NavGroup[] {
  const isPrivileged = !!role && PRIVILEGED.has(role);

  const groups: NavGroup[] = [
    {
      label: 'Panel',
      items: [
        { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
        { to: '/sites', label: 'Sites', icon: Globe },
        { to: '/sites/new', label: 'New Site', icon: Plus },
        { to: '/blueprints', label: 'Blueprints', icon: Layers },
      ],
    },
    {
      label: 'Clients',
      items: features.projects
        ? [
            { to: '/clients', label: 'Clients', icon: Users },
            { to: '/projects', label: 'Projects', icon: FolderKanban },
            { to: '/invoices', label: 'Invoices', icon: Receipt },
          ]
        : [],
    },
    {
      label: 'Insights',
      items: [
        ...(features.healthMonitoring ? [{ to: '/monitoring', label: 'Monitoring', icon: Activity }] : []),
        ...(isPrivileged ? [{ to: '/analytics', label: 'Analytics', icon: BarChart3 }] : []),
        ...(features.productivityMonitor ? [{ to: '/productivity', label: 'Productivity', icon: Timer }] : []),
      ],
    },
    {
      label: 'Sync',
      items: features.siteSync ? [{ to: '/sync', label: 'Sync', icon: RefreshCw }] : [],
    },
    {
      label: 'Settings',
      items: isPrivileged
        ? [
            { to: '/features', label: 'Features', icon: ToggleLeft },
            { to: '/branding', label: 'Branding', icon: Palette },
            { to: '/users', label: 'Team', icon: UserCog },
            { to: '/system', label: 'System', icon: Server },
          ]
        : [],
    },
  ];

  return groups.filter((g) => g.items.length > 0);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w packages/dashboard`
Expected: PASS — 17 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/shell/nav-items.ts packages/dashboard/src/components/shell/nav-items.test.ts
git commit -m "feat(dashboard): add role and flag aware navigation definition"
```

---

## Task 7: Sidebar

**Files:**
- Create: `packages/dashboard/src/components/shell/Sidebar.tsx`

- [ ] **Step 1: Implement**

Create `packages/dashboard/src/components/shell/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { buildNavGroups } from './nav-items';
import { useFeatures, useBranding, useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  const features = useFeatures() as unknown as Record<string, boolean>;
  const branding = useBranding();
  const { version } = useSettings();
  const { user } = useAuth();
  const groups = buildNavGroups(features, user?.role);

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className={cn('flex h-14 items-center gap-2 border-b border-border px-4', collapsed && 'justify-center px-0')}>
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded" />
          : <div className="h-6 w-6 rounded bg-primary" />}
        {!collapsed && <span className="truncate text-sm font-semibold">{branding.siteTitle}</span>}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                        'hover:bg-accent hover:text-accent-foreground',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );

                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-border px-3 py-3', collapsed && 'px-2 text-center')}>
        {!collapsed && (
          <>
            <div className="truncate text-xs text-foreground">{user?.email}</div>
            <div className="text-[11px] text-muted-foreground">{version && `v${version}`}</div>
          </>
        )}
        {collapsed && <div className="text-[11px] text-muted-foreground">{version}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p packages/dashboard`
Expected: no errors. It is not rendered yet; Task 9 mounts it.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/shell/Sidebar.tsx
git commit -m "feat(dashboard): add collapsible sidebar"
```

---

## Task 8: Topbar

**Files:**
- Create: `packages/dashboard/src/components/shell/Topbar.tsx`

- [ ] **Step 1: Implement**

Create `packages/dashboard/src/components/shell/Topbar.tsx`:

```tsx
import { useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, Sun, Moon, Monitor, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { buildNavGroups } from './nav-items';
import { useFeatures } from '../../context/SettingsContext';

function useBreadcrumb(): string {
  const { pathname } = useLocation();
  const features = useFeatures() as unknown as Record<string, boolean>;
  const { user } = useAuth();
  for (const group of buildNavGroups(features, user?.role)) {
    for (const item of group.items) {
      if (item.end ? pathname === item.to : pathname.startsWith(item.to) && item.to !== '/') {
        return item.label;
      }
    }
  }
  return pathname === '/' ? 'Overview' : '';
}

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { choice, cycleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const crumb = useBreadcrumb();

  const ThemeIcon = choice === 'light' ? Sun : choice === 'dark' ? Moon : Monitor;

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-4">
      <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <PanelLeft className="h-4 w-4" />
      </Button>
      <div className="text-sm font-medium">{crumb}</div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label={`Theme: ${choice}`}
          title={`Theme: ${choice}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="max-w-[12rem] truncate">
              {user?.email ?? 'Account'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p packages/dashboard`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/shell/Topbar.tsx
git commit -m "feat(dashboard): add topbar with breadcrumb, theme toggle and account menu"
```

---

## Task 9: AppShell and the single route tree

**Files:**
- Create: `packages/dashboard/src/components/shell/AppShell.tsx`
- Modify: `packages/dashboard/src/main.tsx`, `packages/dashboard/src/pages/admin/AdminLayout.tsx`

- [ ] **Step 1: Create the shell**

Create `packages/dashboard/src/components/shell/AppShell.tsx`. It keeps the auth guards that
`AdminLayout` currently owns — those are load-bearing after plan 2 and must not be lost.

```tsx
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';

const COLLAPSE_KEY = 'wpl-sidebar-collapsed';

export default function AppShell() {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
          <h2 className="mb-1 text-lg font-semibold text-card-foreground">Sign in required</h2>
          <p className="mb-4 text-sm text-muted-foreground">Log in to access this panel.</p>
          <Button className="w-full" onClick={() => navigate('/login')}>Go to login</Button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
          <h2 className="mb-1 text-lg font-semibold text-destructive">Access denied</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Your account does not have permission to view this panel.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => navigate('/')}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside
          className={cn(
            'hidden shrink-0 transition-[width] duration-200 md:block',
            collapsed ? 'w-16' : 'w-60',
          )}
        >
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-30 transition-[width] duration-200',
              collapsed ? 'w-16' : 'w-60',
            )}
          >
            <Sidebar collapsed={collapsed} />
          </div>
        </aside>

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-60 p-0">
            <Sidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onToggleSidebar={() => {
            if (window.matchMedia('(min-width: 768px)').matches) setCollapsed((c) => !c);
            else setDrawerOpen(true);
          }} />
          <main className="flex-1 p-4 md:p-6">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Reduce AdminLayout to its context**

`AdminHeadersContext` is consumed by many pages via `useAdminHeaders`, and `useAdminAuth` by
`AdminRoute`. Replace the whole of `packages/dashboard/src/pages/admin/AdminLayout.tsx` with:

```tsx
import { createContext, useContext } from 'react';
import { useAuth } from '../../context/AuthContext';

interface AdminFetchOpts {
  headers: Record<string, string>;
  credentials: RequestCredentials;
}

/**
 * Retained after the shell rewrite: pages call useAdminHeaders() for their
 * fetches. Auth is cookie-based, so the header bag is empty by design.
 */
const AdminHeadersContext = createContext<AdminFetchOpts>({ headers: {}, credentials: 'include' });

export function useAdminHeaders(): Record<string, string> {
  return useContext(AdminHeadersContext).headers;
}

export function useAdminFetch(): AdminFetchOpts {
  return useContext(AdminHeadersContext);
}

export function useAdminAuth() {
  const { isAdmin } = useAuth();
  return { isAdmin };
}
```

Any page importing `AdminLayout` as a default export must now import `AppShell` instead —
Step 3 handles the only such consumer, `main.tsx`.

- [ ] **Step 3: Replace the route fork with one tree**

In `packages/dashboard/src/main.tsx`, delete `LocalRoutes`, `AgencyRoutes`, the
`useIsLocalMode` import and the `isLocal` branch in `AppRoutes`, and replace them with:

```tsx
function AppRoutes() {
  const { loading, setupRequired } = useSettings();

  if (loading) return null;

  if (setupRequired) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Outside the shell: the shell's guard would bounce these back. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/setup" element={<Navigate to="/" replace />} />

      <Route path="/" element={<AppShell />}>
        <Route index element={<LocalDashboard />} />
        <Route path="sites" element={<SitesListPage />} />
        <Route path="sites/new" element={<LocalLaunchPage />} />
        <Route path="blueprints" element={<BlueprintsTab />} />
        <Route path="blueprints/new" element={<BlueprintEditorPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="analytics" element={<AnalyticsTab />} />
        <Route path="productivity" element={<ProductivityPage />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id/print" element={<InvoicePrintPage />} />
        <Route path="bulk" element={<BulkTab />} />
        <Route path="logs" element={<LogsTab />} />
        <Route path="users" element={<UsersTab />} />
        <Route path="features" element={<FeaturesTab />} />
        <Route path="branding" element={<BrandingTab />} />
        <Route path="system" element={<SystemTab />} />
        <Route path="account" element={<AccountPage />} />

        {/* Old paths, kept so existing links and bookmarks resolve. */}
        <Route path="create" element={<Navigate to="/sites/new" replace />} />
        <Route path="products" element={<Navigate to="/blueprints" replace />} />
        <Route path="create-template" element={<Navigate to="/blueprints/new" replace />} />
        <Route path="create-product" element={<Navigate to="/blueprints/new" replace />} />
        <Route path="admin" element={<Navigate to="/" replace />} />
        <Route path="admin/*" element={<Navigate to="/" replace />} />
        <Route path="launch/:blueprintId" element={<LaunchRedirect />} />
      </Route>
    </Routes>
  );
}
```

Update the imports at the top of the file: add `AppShell`, remove `App`, `LaunchPage`,
`OverviewTab`, `SitesTab`, `AdminLayout` and `useIsLocalMode`.

`LaunchPage`, `OverviewTab` and `SitesTab` were the agency-mode counterparts of
`LocalLaunchPage`, `LocalDashboard` and `SitesListPage`. They are now unreachable; leave the
files in place for Phase B to delete, so this task stays reviewable.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p packages/dashboard && npm run build -w packages/dashboard`
Expected: no errors.

Run: `grep -rn "useIsLocalMode\|isLocal" packages/dashboard/src --include=*.tsx | grep -v "//"`
Expected: matches only in pages Phase B and C will convert, never in `main.tsx` or the shell.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/shell packages/dashboard/src/main.tsx packages/dashboard/src/pages/admin/AdminLayout.tsx
git commit -m "feat(dashboard): single route tree inside the new AppShell"
```

---

## Task 10: Brand accent drives --primary

**Files:**
- Modify: `packages/dashboard/src/context/SettingsContext.tsx`, `packages/dashboard/src/pages/admin/BrandingTab.tsx`
- Create: `packages/dashboard/src/lib/color.ts`, `packages/dashboard/src/lib/color.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/dashboard/src/lib/color.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readableForeground } from './color';

describe('readableForeground', () => {
  it('puts dark text on light accents', () => {
    expect(readableForeground('#fde047')).toBe('#0a0a0a');
    expect(readableForeground('#ffffff')).toBe('#0a0a0a');
  });

  it('puts light text on dark accents', () => {
    expect(readableForeground('#14213d')).toBe('#ffffff');
    expect(readableForeground('#000000')).toBe('#ffffff');
  });

  it('handles the default orange accent', () => {
    expect(readableForeground('#fb8500')).toBe('#0a0a0a');
  });

  it('accepts shorthand hex', () => {
    expect(readableForeground('#fff')).toBe('#0a0a0a');
    expect(readableForeground('#000')).toBe('#ffffff');
  });

  it('falls back to light text on an unparseable value', () => {
    expect(readableForeground('not-a-colour')).toBe('#ffffff');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w packages/dashboard`
Expected: FAIL — `Failed to resolve import "./color"`.

- [ ] **Step 3: Implement**

Create `packages/dashboard/src/lib/color.ts`:

```ts
const DARK_TEXT = '#0a0a0a';
const LIGHT_TEXT = '#ffffff';

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace(/^#/, '');
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Pick readable text for an admin-chosen accent, using WCAG relative luminance.
 * The accent is arbitrary, so the paired foreground has to be derived rather
 * than fixed, or dark text lands on dark buttons.
 */
export function readableForeground(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return LIGHT_TEXT;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return luminance > 0.45 ? DARK_TEXT : LIGHT_TEXT;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w packages/dashboard`
Expected: PASS — 22 tests.

- [ ] **Step 5: Inject the accent**

In `packages/dashboard/src/context/SettingsContext.tsx`, replace the seven
`root.style.setProperty('--prussian-blue', …)` style lines with:

```tsx
        // Only the accent is admin-configurable now; every other colour comes
        // from the light/dark token sets in styles/theme.css.
        const root = document.documentElement;
        root.style.setProperty('--primary', colors.accent);
        root.style.setProperty('--ring', colors.accent);
        root.style.setProperty('--primary-foreground', readableForeground(colors.accent));
```

and add the import:

```tsx
import { readableForeground } from '../lib/color';
```

- [ ] **Step 6: Reduce the Branding tab to one colour**

Read `packages/dashboard/src/pages/admin/BrandingTab.tsx` first — it is 403 lines and the
colour fields are generated from a local array rather than written out individually, so the
exact edit depends on that array's shape. The change: reduce the colour list to the single
`accent` entry, leaving the logo, title and card-layout controls untouched. Relabel it
"Accent colour" with the helper text:

```
Used for buttons, links and focus rings. All other colours follow the light or dark theme.
```

Leave the save payload shape unchanged so untouched settings keep their stored values.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p packages/dashboard && npm run build -w packages/dashboard`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/lib/color.ts packages/dashboard/src/lib/color.test.ts packages/dashboard/src/context/SettingsContext.tsx packages/dashboard/src/pages/admin/BrandingTab.tsx
git commit -m "feat(dashboard): drive --primary from the admin accent colour"
```

---

## Task 11: Delete APP_MODE

**Files:**
- Modify: `packages/api/src/config.ts`, `packages/api/src/index.ts`, `docker-compose.yml`

- [ ] **Step 1: Remove it from config**

In `packages/api/src/config.ts`, delete these lines:

```ts
const appMode = (process.env.APP_MODE || 'agency') as 'local' | 'agency';
const isLocalMode = appMode === 'local';
```

and remove `appMode,` and `isLocalMode,` from the exported object.

- [ ] **Step 2: Remove the remaining readers**

In `packages/api/src/index.ts`:

- delete `appMode: config.appMode,` from the `/api/settings` response
- delete `appMode: config.appMode,` from `/api/admin/system/info`
- replace the update-check condition `if (config.nodeEnv === 'development' && !config.isLocalMode) {` with `if (config.nodeEnv === 'development') {`
- delete the line `` console.log(`[api] Mode: ${config.appMode}`); ``

The migration in `utils/db.ts` reads `process.env.APP_MODE` directly, not `config` — leave that
alone. It is the one-time upgrade path and must keep working for installs that have not yet
migrated.

- [ ] **Step 3: Remove it from compose**

In `docker-compose.yml`, delete the line:

```yaml
      - APP_MODE=${APP_MODE:-agency}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p packages/api && npm test -w packages/api`
Expected: no errors, 85 tests pass.

Run: `grep -rn "isLocalMode\|config.appMode" packages/api/src`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/config.ts packages/api/src/index.ts docker-compose.yml
git commit -m "refactor: delete APP_MODE"
```

---

## Task 12: Browser verification

This is the step that has been missing all along. Every UI defect in this project's recent
history passed a successful build.

- [ ] **Step 1: Deploy, asserting the image is not stale**

```bash
npm run build -w packages/api && npm run build -w packages/dashboard
docker compose build --no-cache api dashboard
docker compose up -d api dashboard
docker compose exec -T dashboard sh -c "grep -c 'Toggle sidebar' /usr/share/nginx/html/assets/*.js"
```
Expected: non-zero. `docker compose up --build` has silently served stale images on this
project; always assert a marker before believing a behavioural check.

- [ ] **Step 2: Drive the shell**

Using the Playwright tools, for `http://localhost`:

1. Navigate and take a snapshot. Expected: sidebar with the Panel group, topbar with a
   breadcrumb, no console errors.
2. Click the theme toggle three times, screenshotting each. Expected: light → dark → system,
   with `<html class="dark">` present only in dark (or in system when the OS is dark).
3. Reload while pinned to dark. Expected: no white flash; `dark` class present on first paint.
4. Click the sidebar toggle. Expected: sidebar narrows to a 64px rail with icons only; hovering
   an icon shows its tooltip. Reload — the rail is still collapsed.
5. Resize to 375px wide. Expected: sidebar hidden; the toggle opens an overlay drawer; clicking
   a link closes it.
6. Visit `/admin/sites` and `/products`. Expected: redirected to `/` and `/blueprints`.
7. Visit each nav destination in turn. Expected: each renders its existing page inside the new
   shell, with no console errors.

- [ ] **Step 3: Capture evidence**

Save screenshots of the Overview page in both themes, and of the collapsed rail, to
`docs/superpowers/evidence/phase-a/`. These are the before-images Phase B is judged against.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(dashboard): address issues found in phase A browser verification"
```

---

## Done criteria

- `npm test -w packages/dashboard` passes with 22 tests; `npm test -w packages/api` with 85.
- Both packages typecheck; the dashboard builds.
- `grep -rn "isLocalMode\|config.appMode" packages/api/src` returns nothing, and `APP_MODE` is
  gone from `docker-compose.yml`.
- `main.tsx` has one route tree and no `useIsLocalMode`.
- The panel renders in the new shell with every existing page reachable.
- Theme toggle cycles light → dark → system, persists across reloads, and does not flash.
- The sidebar collapses to a rail on desktop and to a drawer on mobile, and remembers its state.
- `index.css` is unchanged and still styling the page bodies — Preflight is **not** enabled.
- Screenshots in both themes exist under `docs/superpowers/evidence/phase-a/`.
