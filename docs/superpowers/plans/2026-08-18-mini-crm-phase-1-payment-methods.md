# Mini CRM Phase 1: Payment Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator define reusable payment methods once, choose which ones appear on each invoice, and have those instructions render on the invoice the client receives.

**Architecture:** Two new tables — `payment_methods` (install-wide list) and `invoice_payment_methods` (join). A new service module owns both, keeping `project.service.ts` from growing further. A new Settings page manages the list; the invoice dialog picks per invoice; the print page renders the selection.

**Tech Stack:** Node.js, Express, TypeScript, better-sqlite3, React 19, shadcn/ui, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-mini-crm-design.md`

## Global Constraints

- **Absence means hidden.** An invoice with no rows in `invoice_payment_methods` shows no methods. Adding a method later must never retroactively alter an invoice already sent.
- **Methods are install-wide**, managed by owner/admin. There is no per-user ownership column on `payment_methods`.
- **Deactivating or deleting a method must not alter invoices already sent.** An invoice keeps rendering what was attached to it.
- A method is a `label`, a free-form `instructions` block, an `active` flag and a `sort_order`. **No typed per-method fields** — no IBAN/SWIFT/wallet columns.
- Route prefix stays `/api/projects/*`. The stored feature key stays `feature.projects`.
- CRM rows are scoped per staff user (`user_id = ?`); there is no privileged override. Invoice lookups in this phase follow that existing pattern exactly.
- Never write a hex colour or inline `style` prop in a component — use the semantic tokens in `packages/dashboard/src/styles/theme.css`. `InvoicePrintPage` is the sanctioned exception, pinned black-on-white so it prints.
- DB timestamps are UTC without a `Z`; append one before `new Date()`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/api/src/utils/db.ts` | **Modify.** Two `CREATE TABLE IF NOT EXISTS` blocks. No migration needed — new tables, not new columns. |
| `packages/api/src/services/paymentMethod.service.ts` | **Create.** All payment-method logic: CRUD over the list, and get/set of an invoice's attachments. Kept out of `project.service.ts`, which is already ~500 lines. |
| `packages/api/src/services/paymentMethod.service.test.ts` | **Create.** Tests for the above. |
| `packages/api/src/routes/projects.ts` | **Modify.** Six routes: list/create/update/delete methods, and get/set an invoice's attachments. |
| `packages/api/src/test-helpers/db.ts` | **Modify.** Add the two tables to the in-memory fixture. |
| `packages/dashboard/src/pages/admin/PaymentMethodsPage.tsx` | **Create.** The Settings screen: list, add, edit, reorder, activate/deactivate, delete. |
| `packages/dashboard/src/main.tsx` | **Modify.** Route `settings/payment-methods`. |
| `packages/dashboard/src/components/shell/nav-items.ts` | **Modify.** Settings group entry. |
| `packages/dashboard/src/components/shell/nav-items.test.ts` | **Modify.** Assert the entry appears for privileged roles and is absent for members. |
| `packages/dashboard/src/pages/admin/InvoicesPage.tsx` | **Modify.** Checklist of active methods in the invoice dialog; persist on save. |
| `packages/dashboard/src/pages/admin/InvoicePrintPage.tsx` | **Modify.** Render attached methods below Notes. |
| `CLAUDE.md` | **Modify.** Schema and endpoint documentation. |

---

### Task 1: Schema and the payment-method service

Pure data layer first, fully tested, before any route or screen exists.

**Files:**
- Modify: `packages/api/src/utils/db.ts`
- Modify: `packages/api/src/test-helpers/db.ts`
- Create: `packages/api/src/services/paymentMethod.service.ts`
- Create: `packages/api/src/services/paymentMethod.service.test.ts`

**Interfaces:**
- Consumes: `getDb` from `../utils/db`; `ValidationError`, `NotFoundError` from `../utils/errors`.
- Produces, all exported from `paymentMethod.service.ts`:
  - `interface PaymentMethodRecord { id: string; label: string; instructions: string; active: number; sort_order: number; created_at: string; updated_at: string }`
  - `listPaymentMethods(opts?: { activeOnly?: boolean }): PaymentMethodRecord[]`
  - `createPaymentMethod(data: { label: string; instructions?: string; active?: boolean }): PaymentMethodRecord`
  - `updatePaymentMethod(id: string, data: { label?: string; instructions?: string; active?: boolean; sort_order?: number }): PaymentMethodRecord`
  - `deletePaymentMethod(id: string): void`
  - `getInvoicePaymentMethods(invoiceId: string): PaymentMethodRecord[]`
  - `setInvoicePaymentMethods(invoiceId: string, methodIds: string[]): void`

- [ ] **Step 1: Add the two tables to the production schema**

In `packages/api/src/utils/db.ts`, inside the existing `db.exec(\`…\`)` block in `initSchema`, next to the `invoices` table:

```sql
    -- Reusable payment instructions, defined once by the operator. Install-wide
    -- rather than per-user: these are the business's bank details, not a
    -- personal setting.
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Which methods appear on which invoice. Absence means hidden, so adding a
    -- method later never retroactively changes an invoice already sent.
    CREATE TABLE IF NOT EXISTS invoice_payment_methods (
      invoice_id TEXT NOT NULL,
      payment_method_id TEXT NOT NULL,
      PRIMARY KEY (invoice_id, payment_method_id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
    );
```

No `ALTER TABLE` migration is required: these are new tables, and `CREATE TABLE IF NOT EXISTS` runs on every boot.

- [ ] **Step 2: Add both tables to the test fixture**

In `packages/api/src/test-helpers/db.ts`, add two DDL constants copied verbatim from Step 1, and include them in the array inside `createTestDb`:

```ts
const PAYMENT_METHODS_TABLE = `
  CREATE TABLE payment_methods (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const INVOICE_PAYMENT_METHODS_TABLE = `
  CREATE TABLE invoice_payment_methods (
    invoice_id TEXT NOT NULL,
    payment_method_id TEXT NOT NULL,
    PRIMARY KEY (invoice_id, payment_method_id),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
  )`;
```

`packages/api/src/test-helpers/db.test.ts` asserts the exact table list. Add `'invoice_payment_methods'` and `'payment_methods'` to that array, keeping it alphabetically sorted.

- [ ] **Step 3: Write the failing tests**

Create `packages/api/src/services/paymentMethod.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  listPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod,
  getInvoicePaymentMethods, setInvoicePaymentMethods,
} from './paymentMethod.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total)
              VALUES ('inv1', 'INV-0001', 'u1', 'c1', '[]', 100)`).run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total)
              VALUES ('inv2', 'INV-0002', 'u1', 'c1', '[]', 200)`).run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('payment method list', () => {
  it('rejects a method with no label', () => {
    expect(() => createPaymentMethod({ label: '   ' })).toThrow(/label/i);
  });

  it('creates active by default and returns it', () => {
    const m = createPaymentMethod({ label: 'Bank Transfer', instructions: 'IBAN GB00 ...' });
    expect(m.label).toBe('Bank Transfer');
    expect(m.instructions).toBe('IBAN GB00 ...');
    expect(m.active).toBe(1);
  });

  it('orders by sort_order then label, not by insertion', () => {
    const b = createPaymentMethod({ label: 'B method' });
    const a = createPaymentMethod({ label: 'A method' });
    updatePaymentMethod(b.id, { sort_order: 1 });
    updatePaymentMethod(a.id, { sort_order: 2 });
    expect(listPaymentMethods().map((m) => m.label)).toEqual(['B method', 'A method']);
  });

  it('can filter to active methods only', () => {
    createPaymentMethod({ label: 'Live' });
    const off = createPaymentMethod({ label: 'Retired' });
    updatePaymentMethod(off.id, { active: false });
    expect(listPaymentMethods({ activeOnly: true }).map((m) => m.label)).toEqual(['Live']);
    expect(listPaymentMethods().map((m) => m.label).sort()).toEqual(['Live', 'Retired']);
  });

  it('reports a missing method rather than silently doing nothing', () => {
    expect(() => updatePaymentMethod('nope', { label: 'x' })).toThrow(/not found/i);
    expect(() => deletePaymentMethod('nope')).toThrow(/not found/i);
  });
});

describe('invoice attachment', () => {
  it('attaches nothing by default', () => {
    // Absence means hidden: an invoice created before any method existed, or
    // one the operator never configured, shows no payment instructions.
    expect(getInvoicePaymentMethods('inv1')).toEqual([]);
  });

  it('returns the attached methods in list order', () => {
    const first = createPaymentMethod({ label: 'Bank' });
    const second = createPaymentMethod({ label: 'Wise' });
    updatePaymentMethod(first.id, { sort_order: 1 });
    updatePaymentMethod(second.id, { sort_order: 2 });
    setInvoicePaymentMethods('inv1', [second.id, first.id]);
    expect(getInvoicePaymentMethods('inv1').map((m) => m.label)).toEqual(['Bank', 'Wise']);
  });

  it('replaces the selection rather than appending to it', () => {
    const a = createPaymentMethod({ label: 'A' });
    const b = createPaymentMethod({ label: 'B' });
    setInvoicePaymentMethods('inv1', [a.id, b.id]);
    setInvoicePaymentMethods('inv1', [b.id]);
    expect(getInvoicePaymentMethods('inv1').map((m) => m.label)).toEqual(['B']);
  });

  it('keeps each invoice independent', () => {
    const a = createPaymentMethod({ label: 'A' });
    setInvoicePaymentMethods('inv1', [a.id]);
    expect(getInvoicePaymentMethods('inv2')).toEqual([]);
  });

  it('ignores an unknown method id instead of failing the whole save', () => {
    const a = createPaymentMethod({ label: 'A' });
    setInvoicePaymentMethods('inv1', [a.id, 'ghost']);
    expect(getInvoicePaymentMethods('inv1').map((m) => m.label)).toEqual(['A']);
  });

  it('still shows a deactivated method on invoices already using it', () => {
    // Retiring a method must not silently blank the payment instructions on
    // invoices already sent to clients.
    const a = createPaymentMethod({ label: 'Old Bank' });
    setInvoicePaymentMethods('inv1', [a.id]);
    updatePaymentMethod(a.id, { active: false });
    expect(getInvoicePaymentMethods('inv1').map((m) => m.label)).toEqual(['Old Bank']);
  });

  it('refuses to delete a method an invoice still uses', () => {
    // Deleting would blank the instructions on an invoice already sent. The
    // operator deactivates instead, which hides it from future invoices.
    const a = createPaymentMethod({ label: 'In Use' });
    setInvoicePaymentMethods('inv1', [a.id]);
    expect(() => deletePaymentMethod(a.id)).toThrow(/in use/i);
    expect(getInvoicePaymentMethods('inv1')).toHaveLength(1);
  });

  it('deletes a method no invoice uses', () => {
    const a = createPaymentMethod({ label: 'Unused' });
    deletePaymentMethod(a.id);
    expect(listPaymentMethods()).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd packages/api && npx vitest run src/services/paymentMethod.service.test.ts`
Expected: FAIL — `Cannot find module './paymentMethod.service'`.

- [ ] **Step 5: Write the service**

Create `packages/api/src/services/paymentMethod.service.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';

export interface PaymentMethodRecord {
  id: string;
  label: string;
  instructions: string;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const now = () => new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');

/**
 * The operator's payment methods, in the order they should be presented.
 *
 * Sorted by `sort_order` then `label` so the operator controls sequence and
 * ties fall back to something stable rather than insertion order.
 */
export function listPaymentMethods(opts: { activeOnly?: boolean } = {}): PaymentMethodRecord[] {
  const sql = `SELECT * FROM payment_methods${opts.activeOnly ? ' WHERE active = 1' : ''} ORDER BY sort_order, label`;
  return getDb().prepare(sql).all() as PaymentMethodRecord[];
}

export function createPaymentMethod(data: { label: string; instructions?: string; active?: boolean }): PaymentMethodRecord {
  if (!data.label?.trim()) throw new ValidationError('Payment method label is required');
  const db = getDb();
  const id = uuidv4();
  const stamp = now();
  db.prepare(`INSERT INTO payment_methods (id, label, instructions, active, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, 0, ?, ?)`).run(
    id, data.label.trim(), data.instructions?.trim() || '', data.active === false ? 0 : 1, stamp, stamp,
  );
  return db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id) as PaymentMethodRecord;
}

export function updatePaymentMethod(
  id: string,
  data: { label?: string; instructions?: string; active?: boolean; sort_order?: number },
): PaymentMethodRecord {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id) as PaymentMethodRecord | undefined;
  if (!existing) throw new NotFoundError('Payment method not found');
  if (data.label !== undefined && !data.label.trim()) throw new ValidationError('Payment method label is required');
  db.prepare(`UPDATE payment_methods SET label = ?, instructions = ?, active = ?, sort_order = ?, updated_at = ? WHERE id = ?`).run(
    data.label?.trim() || existing.label,
    data.instructions !== undefined ? data.instructions.trim() : existing.instructions,
    data.active === undefined ? existing.active : (data.active ? 1 : 0),
    data.sort_order === undefined ? existing.sort_order : data.sort_order,
    now(), id,
  );
  return db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id) as PaymentMethodRecord;
}

/**
 * Remove a method the operator no longer offers.
 *
 * Refused while any invoice still attaches it: deleting would blank the payment
 * instructions on an invoice already in a client's inbox. Deactivating is the
 * way to retire a method — it disappears from future invoices and stays on old
 * ones.
 */
export function deletePaymentMethod(id: string): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM payment_methods WHERE id = ?').get(id);
  if (!existing) throw new NotFoundError('Payment method not found');
  const used = (db.prepare('SELECT COUNT(*) as count FROM invoice_payment_methods WHERE payment_method_id = ?')
    .get(id) as { count: number }).count;
  if (used > 0) {
    throw new ConflictError('This payment method is in use by an invoice. Deactivate it instead to hide it from new invoices.');
  }
  db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);
}

/**
 * The methods attached to one invoice, in presentation order.
 *
 * Deliberately not filtered by `active`: a method retired after an invoice was
 * sent must still render on that invoice.
 */
export function getInvoicePaymentMethods(invoiceId: string): PaymentMethodRecord[] {
  return getDb().prepare(`
    SELECT pm.* FROM payment_methods pm
    JOIN invoice_payment_methods ipm ON ipm.payment_method_id = pm.id
    WHERE ipm.invoice_id = ?
    ORDER BY pm.sort_order, pm.label
  `).all(invoiceId) as PaymentMethodRecord[];
}

/**
 * Replace an invoice's attached methods with exactly `methodIds`.
 *
 * Unknown ids are skipped rather than throwing: a stale id in a submitted form
 * should not reject the operator's whole save. In one transaction so a failure
 * cannot leave an invoice with a half-applied selection.
 */
export function setInvoicePaymentMethods(invoiceId: string, methodIds: string[]): void {
  const db = getDb();
  const apply = db.transaction((ids: string[]) => {
    db.prepare('DELETE FROM invoice_payment_methods WHERE invoice_id = ?').run(invoiceId);
    const insert = db.prepare('INSERT OR IGNORE INTO invoice_payment_methods (invoice_id, payment_method_id) VALUES (?, ?)');
    for (const methodId of ids) {
      const known = db.prepare('SELECT id FROM payment_methods WHERE id = ?').get(methodId);
      if (known) insert.run(invoiceId, methodId);
    }
  });
  apply(methodIds || []);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd packages/api && npx vitest run src/services/paymentMethod.service.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 7: Run the whole API suite and typecheck**

Run: `cd packages/api && npx vitest run && npx tsc --noEmit`
Expected: all PASS (the fixture's table-list test must now include the two new tables), no TypeScript output.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/utils/db.ts packages/api/src/test-helpers/db.ts packages/api/src/test-helpers/db.test.ts packages/api/src/services/paymentMethod.service.ts packages/api/src/services/paymentMethod.service.test.ts
git commit -m "feat(crm): payment methods and per-invoice attachment

Two tables and the service over them. Absence of a join row means hidden, so
adding a method later never alters an invoice already sent, and a deactivated
method keeps rendering on invoices that already carry it.

Deleting a method an invoice still uses is refused rather than silently
blanking the payment instructions on something already in a client's inbox."
```

---

### Task 2: The API routes

**Files:**
- Modify: `packages/api/src/routes/projects.ts`

**Interfaces:**
- Consumes: every export of `paymentMethod.service.ts` from Task 1; `getInvoice` from `./project.service`; `seesAllRows` from `../utils/scope`.
- Produces: six endpoints under `/api/projects`, listed below.

- [ ] **Step 1: Add the imports and a privilege guard**

At the top of `packages/api/src/routes/projects.ts`, alongside the existing imports:

```ts
import {
  listPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod,
  getInvoicePaymentMethods, setInvoicePaymentMethods,
} from '../services/paymentMethod.service';
import { seesAllRows } from '../utils/scope';
```

Then, below the existing `requireProjects` middleware:

```ts
/**
 * Payment methods are the business's bank details, install-wide rather than
 * per-user, so only owner/admin may change the list. Reading it is open to any
 * caller who already passed requireProjects, because attaching a method to an
 * invoice needs the list.
 */
function requirePrivileged(req: AuthRequest, res: Response, next: () => void) {
  if (!seesAllRows(req.userRole)) {
    res.status(403).json({ error: 'Only an owner or admin can manage payment methods' });
    return;
  }
  next();
}
```

- [ ] **Step 2: Add the four list-management routes**

Place these after the invoice routes in the same file:

```ts
// ── Payment methods ──

router.get('/payment-methods', (req: AuthRequest, res: Response) => {
  try {
    res.json(listPaymentMethods({ activeOnly: req.query.activeOnly === 'true' }));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/payment-methods', requirePrivileged, (req: AuthRequest, res: Response) => {
  try {
    res.json(createPaymentMethod(req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/payment-methods/:id', requirePrivileged, (req: AuthRequest, res: Response) => {
  try {
    res.json(updatePaymentMethod(req.params.id, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/payment-methods/:id', requirePrivileged, (req: AuthRequest, res: Response) => {
  try {
    deletePaymentMethod(req.params.id);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Add the two per-invoice routes**

```ts
router.get('/invoices/:id/payment-methods', (req: AuthRequest, res: Response) => {
  try {
    // Authorise through the invoice the caller can actually see, so this never
    // becomes a way to probe invoice ids that belong to someone else.
    const invoice = getInvoice(req.params.id, req.userId!);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    res.json(getInvoicePaymentMethods(req.params.id));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/invoices/:id/payment-methods', (req: AuthRequest, res: Response) => {
  try {
    const invoice = getInvoice(req.params.id, req.userId!);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    const ids = req.body?.methodIds;
    if (!Array.isArray(ids)) { res.status(400).json({ error: 'methodIds must be an array' }); return; }
    setInvoicePaymentMethods(req.params.id, ids);
    res.json(getInvoicePaymentMethods(req.params.id));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
```

Both authorise on `getInvoice(id, req.userId!)` before touching attachments. Without that, a caller could read or rewrite the payment instructions on an invoice belonging to another staff user.

- [ ] **Step 4: Include attachments in the invoice detail response**

The dialog needs the current selection when opening an existing invoice. Modify the existing `GET /invoices/:id` handler (currently at line 196) so its response carries them:

```ts
router.get('/invoices/:id', (req: AuthRequest, res: Response) => {
  try {
    const invoice = getInvoice(req.params.id, req.userId!);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    res.json({
      ...invoice,
      items: JSON.parse(invoice.items as any),
      paymentMethods: getInvoicePaymentMethods(req.params.id),
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Verify the suite and types**

Run: `cd packages/api && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no TypeScript output.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/projects.ts
git commit -m "feat(crm): payment method endpoints

Managing the list needs owner/admin; reading it does not, because attaching a
method to an invoice needs the list. Both per-invoice routes authorise through
getInvoice first, so neither becomes a way to read or rewrite the payment
instructions on another staff user's invoice."
```

---

### Task 3: The Settings screen

**Files:**
- Create: `packages/dashboard/src/pages/admin/PaymentMethodsPage.tsx`
- Modify: `packages/dashboard/src/main.tsx`
- Modify: `packages/dashboard/src/components/shell/nav-items.ts`
- Modify: `packages/dashboard/src/components/shell/nav-items.test.ts`

**Interfaces:**
- Consumes: the endpoints from Task 2; `apiFetch` from `../../utils/api`; `useToast` from `../../components/Toast`.
- Produces: the route `/payment-methods` and a nav entry in the Settings group.

- [ ] **Step 1: Write the failing nav test**

In `packages/dashboard/src/components/shell/nav-items.test.ts`, inside `describe('buildNavGroups', …)`:

```ts
  it('offers payment methods in Settings to privileged roles only', () => {
    const settings = buildNavGroups(allFeatures, 'admin').find((g) => g.label === 'Settings');
    expect(settings?.items.map((i) => i.to)).toContain('/payment-methods');
    expect(buildNavGroups(allFeatures, 'member').find((g) => g.label === 'Settings')).toBeUndefined();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/dashboard && npx vitest run src/components/shell/nav-items.test.ts -t "payment methods"`
Expected: FAIL — `/payment-methods` is not in the Settings group.

- [ ] **Step 3: Add the nav entry**

In `packages/dashboard/src/components/shell/nav-items.ts`, add to the Settings group's items, after the `/branding` entry:

```ts
            { to: '/payment-methods', label: 'Payment Methods', icon: CreditCard },
```

Import `CreditCard` from `lucide-react` alongside the other icons at the top of the file.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/dashboard && npx vitest run src/components/shell/nav-items.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Build the page**

Create `packages/dashboard/src/pages/admin/PaymentMethodsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '../../utils/api';
import { useToast } from '../../components/Toast';

interface PaymentMethod {
  id: string;
  label: string;
  instructions: string;
  active: number;
  sort_order: number;
}

export default function PaymentMethodsPage() {
  const toast = useToast();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [instructions, setInstructions] = useState('');

  async function load() {
    try {
      const res = await apiFetch('/api/projects/payment-methods');
      if (res.ok) setMethods(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/projects/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, instructions }),
      });
      if (res.ok) {
        setLabel(''); setInstructions('');
        await load();
        toast.success('Payment method added');
      } else {
        toast.error((await res.json().catch(() => ({}))).error || 'Could not add the method');
      }
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, data: Partial<PaymentMethod> & { active?: boolean }) {
    const res = await apiFetch(`/api/projects/payment-methods/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
    else toast.error((await res.json().catch(() => ({}))).error || 'Could not save');
  }

  async function remove(id: string) {
    if (!confirm('Delete this payment method?')) return;
    const res = await apiFetch(`/api/projects/payment-methods/${id}`, { method: 'DELETE' });
    if (res.ok) { await load(); toast.success('Payment method deleted'); }
    // A method attached to an invoice cannot be deleted; the API explains why,
    // and that message is more useful than a generic failure.
    else toast.error((await res.json().catch(() => ({}))).error || 'Could not delete');
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading payment methods...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <CreditCard className="h-6 w-6" /> Payment Methods
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define how clients can pay you. Choose which of these appear on each invoice when you
          create it — an invoice shows only the methods you attach to it.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="pm-label">Name</Label>
            <Input id="pm-label" value={label} placeholder="Bank Transfer"
                   onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button onClick={add} disabled={saving || !label.trim()}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding...</> : 'Add method'}
          </Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pm-instructions">Instructions</Label>
          <Textarea id="pm-instructions" rows={3} value={instructions}
                    placeholder={'Account name: ...\nIBAN: ...\nReference: your invoice number'}
                    onChange={(e) => setInstructions(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Shown to the client exactly as written, so format it the way you want it read.
          </p>
        </div>
      </Card>

      {methods.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No payment methods yet. Add one above and it becomes available to attach to invoices.
        </p>
      ) : (
        <div className="space-y-3">
          {methods.map((m) => (
            <Card key={m.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input className="max-w-xs font-medium" defaultValue={m.label}
                       onBlur={(e) => e.target.value.trim() !== m.label && patch(m.id, { label: e.target.value })} />
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch id={`active-${m.id}`} checked={m.active === 1}
                            onCheckedChange={(checked) => patch(m.id, { active: checked })} />
                    <Label htmlFor={`active-${m.id}`} className="text-sm">Active</Label>
                  </div>
                  <Button variant="destructive" size="xs" onClick={() => remove(m.id)}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
              <Textarea rows={3} defaultValue={m.instructions}
                        onBlur={(e) => e.target.value !== m.instructions && patch(m.id, { instructions: e.target.value })} />
              {m.active !== 1 && (
                <p className="text-xs text-muted-foreground">
                  Inactive — hidden when creating new invoices. Invoices already using it are unchanged.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Register the route**

In `packages/dashboard/src/main.tsx`, alongside the other settings routes (near `<Route path="panel" …>`):

```tsx
          <Route path="payment-methods" element={<PaymentMethodsPage />} />
```

Import it at the top with the other page imports:

```tsx
import PaymentMethodsPage from './pages/admin/PaymentMethodsPage';
```

- [ ] **Step 7: Verify the dashboard**

Run: `cd packages/dashboard && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no TypeScript output, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/pages/admin/PaymentMethodsPage.tsx packages/dashboard/src/main.tsx packages/dashboard/src/components/shell/nav-items.ts packages/dashboard/src/components/shell/nav-items.test.ts
git commit -m "feat(crm): payment methods settings screen

Add, rename, edit instructions, activate and delete. Deactivating is presented
as the way to retire a method, because deleting one an invoice still uses is
refused by the API — that invoice is already in a client's inbox."
```

---

### Task 4: Attaching methods on the invoice, and rendering them

**Files:**
- Modify: `packages/dashboard/src/pages/admin/InvoicesPage.tsx`
- Modify: `packages/dashboard/src/pages/admin/InvoicePrintPage.tsx`

**Interfaces:**
- Consumes: `GET /api/projects/payment-methods?activeOnly=true`, `PUT /api/projects/invoices/:id/payment-methods`, and the `paymentMethods` array now present on `GET /api/projects/invoices/:id`.
- Produces: nothing consumed later.

- [ ] **Step 1: Load the active methods in the invoice page**

In `packages/dashboard/src/pages/admin/InvoicesPage.tsx`, add state beside the existing form state:

```tsx
  const [methods, setMethods] = useState<{ id: string; label: string }[]>([]);
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
```

Load the active list once, in an effect next to the existing data-loading effects:

```tsx
  useEffect(() => {
    apiFetch('/api/projects/payment-methods?activeOnly=true')
      .then((r) => (r.ok ? r.json() : []))
      .then(setMethods)
      .catch(() => setMethods([]));
  }, []);
```

`activeOnly=true` is deliberate: retired methods must not be offered on new invoices, while remaining on old ones.

- [ ] **Step 2: Render the checklist in the invoice dialog**

Inside the dialog, immediately after the Currency field:

```tsx
            {methods.length > 0 && (
              <div className="space-y-2">
                <Label>Payment methods shown on this invoice</Label>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {methods.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={selectedMethods.includes(m.id)}
                        onCheckedChange={(checked) =>
                          setSelectedMethods((prev) =>
                            checked ? [...prev, m.id] : prev.filter((x) => x !== m.id))}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave all unchecked to show no payment instructions on this invoice.
                </p>
              </div>
            )}
```

Import `Checkbox` from `@/components/ui/checkbox` at the top of the file.

- [ ] **Step 3: Persist the selection after saving the invoice**

The invoice must exist before methods can attach to it, so the attachment call follows the create/update call. In `handleSave`, replace the two lines between the error check and `setShowModal(false)`:

```tsx
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      // The invoice must exist before anything can attach to it, so this
      // follows the save. `data.id` covers a create; `editing.id` an update.
      const invoiceId = editing ? editing.id : data.id;
      if (invoiceId) {
        await apiFetch(`/api/projects/invoices/${invoiceId}/payment-methods`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ methodIds: selectedMethods }),
        });
      }
      setShowModal(false);
```

- [ ] **Step 4: Populate the selection when editing, and clear it for a new invoice**

`openEdit(inv)` currently fills the form synchronously from the row it was handed, which does not carry attachments. Make it async and fetch them:

```tsx
  async function openEdit(inv: Invoice) {
    setEditing(inv);
    setForm({
      client_id: inv.client_id, project_id: inv.project_id || '',
      items: inv.items.length ? inv.items : [emptyItem()],
      tax_rate: inv.tax_rate, due_date: inv.due_date || '', notes: inv.notes || '', currency: inv.currency,
    });
    setSelectedMethods([]);
    setError('');
    setShowModal(true);
    // Fetched after the dialog opens so it never blocks on the network; the
    // checkboxes fill in a moment later.
    const res = await apiFetch(`/api/projects/invoices/${inv.id}`, { headers });
    if (res.ok) {
      const full = await res.json();
      setSelectedMethods((full.paymentMethods || []).map((m: { id: string }) => m.id));
    }
  }
```

In the handler that opens the dialog for a **new** invoice (the one immediately above `openEdit`, which ends `setShowModal(true)` after resetting `setForm({...})`), add `setSelectedMethods([]);` beside that reset. Without it, the checkboxes carry over from the last invoice edited.

- [ ] **Step 5: Render the methods on the printed invoice**

In `packages/dashboard/src/pages/admin/InvoicePrintPage.tsx`, add state and a fetch beside the existing invoice load:

```tsx
  const [methods, setMethods] = useState<{ id: string; label: string; instructions: string }[]>([]);
```

```tsx
    apiFetch(`/api/projects/invoices/${id}/payment-methods`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setMethods)
      .catch(() => setMethods([]));
```

Then render below the Notes block (which currently ends around line 150). This page is pinned black-on-white so it prints correctly, so it uses explicit colours rather than theme tokens — matching the surrounding code:

```tsx
        {methods.length > 0 && (
          <div className="mt-8 border-t border-black/15 pt-4 text-sm">
            <h4 className="mb-2 font-semibold uppercase tracking-wide">How to pay</h4>
            <div className="space-y-3">
              {methods.map((m) => (
                <div key={m.id}>
                  <div className="font-semibold">{m.label}</div>
                  <p className="whitespace-pre-wrap">{m.instructions}</p>
                </div>
              ))}
            </div>
          </div>
        )}
```

`whitespace-pre-wrap` is required: the instructions are free-form text the operator formatted with line breaks, and without it every bank detail collapses onto one line.

- [ ] **Step 6: Verify the dashboard**

Run: `cd packages/dashboard && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no TypeScript output, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/pages/admin/InvoicesPage.tsx packages/dashboard/src/pages/admin/InvoicePrintPage.tsx
git commit -m "feat(crm): choose payment methods per invoice and print them

The dialog offers active methods only, so a retired method is never attached to
a new invoice while staying on the ones already sent. Instructions render with
whitespace preserved, since the operator formats them as lines."
```

---

### Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Document the tables**

In `CLAUDE.md`, in the Database Schema list, after the `invoices` entry:

```
- **payment_methods** — id, label, instructions (free-form), active, sort_order, created_at, updated_at. Install-wide, not per-user: these are the business's bank details. Only owner/admin may change the list
- **invoice_payment_methods** — invoice_id, payment_method_id (link table). **Absence means hidden** — an invoice shows only the methods attached to it, so adding a method later never alters an invoice already sent
```

- [ ] **Step 2: Document the endpoints**

In the Mini CRM API section, after the invoice endpoints:

```
- `GET /payment-methods` — list (`?activeOnly=true` for the ones offered on new invoices)
- `POST|PUT|DELETE /payment-methods[/:id]` — manage the list; owner/admin only. Deleting one an invoice still uses returns 409 — deactivate instead, which hides it from new invoices while leaving sent ones intact
- `GET|PUT /invoices/:id/payment-methods` — read or replace an invoice's attached methods; `PUT` takes `{ methodIds: string[] }` and authorises through the invoice first
```

- [ ] **Step 3: Verify and commit**

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
grep -n "payment_methods" CLAUDE.md
git add CLAUDE.md
git commit -m "docs: payment methods schema and endpoints"
```

---

## Done when

- `cd packages/api && npx vitest run` and `cd packages/dashboard && npx vitest run` both pass, both typecheck, and the dashboard builds.
- `GET /api/projects/payment-methods` returns `[]` on a fresh install rather than erroring.

## Verify on a running panel

After `docker compose up -d --build api dashboard`:

1. **Settings → Payment Methods** exists. Add "Bank Transfer" with several lines of instructions.
2. Create an invoice; the method appears as a checkbox. Attach it and save.
3. Open that invoice's print view: the instructions render under "How to pay", **with the line breaks preserved**.
4. Create a second invoice and attach nothing. Its print view shows no payment section at all.
5. Deactivate the method. Create a third invoice — the method is no longer offered. Re-open the print view from step 3: **it still shows the instructions.**
6. Try to delete a method attached to an invoice. It is refused, with a message telling you to deactivate instead.

Items 4 and 5 are the ones that fail quietly. A default-on attachment would silently add payment details to invoices the operator never configured, and a deactivation that also blanked sent invoices would change a document a client already holds.
