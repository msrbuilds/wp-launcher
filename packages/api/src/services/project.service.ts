import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';

// ── Interfaces ──

export interface ClientRecord {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRecord {
  id: string;
  user_id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  user_id: string;
  client_id: string;
  project_id: string | null;
  items: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

// ── Clients ──

export function createClient(userId: string, data: { name: string; email?: string; phone?: string; company?: string; notes?: string }): ClientRecord {
  if (!data.name?.trim()) throw new ValidationError('Client name is required');
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');
  db.prepare(`INSERT INTO clients (id, user_id, name, email, phone, company, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, userId, data.name.trim(), data.email?.trim() || null, data.phone?.trim() || null, data.company?.trim() || null, data.notes?.trim() || null, now, now
  );
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as ClientRecord;
}

export function updateClient(id: string, userId: string, data: { name?: string; email?: string; phone?: string; company?: string; notes?: string }): ClientRecord {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(id, userId) as ClientRecord | undefined;
  if (!existing) throw new NotFoundError('Client not found');
  const now = new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');
  db.prepare(`UPDATE clients SET name = ?, email = ?, phone = ?, company = ?, notes = ?, updated_at = ? WHERE id = ?`).run(
    data.name?.trim() || existing.name, data.email?.trim() ?? existing.email, data.phone?.trim() ?? existing.phone,
    data.company?.trim() ?? existing.company, data.notes?.trim() ?? existing.notes, now, id
  );
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as ClientRecord;
}

export function deleteClient(id: string, userId: string): void {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(id, userId) as ClientRecord | undefined;
  if (!existing) throw new NotFoundError('Client not found');
  const projectCount = (db.prepare('SELECT COUNT(*) as count FROM projects WHERE client_id = ? AND user_id = ?').get(id, userId) as { count: number }).count;
  if (projectCount > 0) throw new ConflictError('Cannot delete client with linked projects. Delete or unlink the projects first.');
  const invoiceCount = (db.prepare('SELECT COUNT(*) as count FROM invoices WHERE client_id = ? AND user_id = ?').get(id, userId) as { count: number }).count;
  if (invoiceCount > 0) throw new ConflictError('Cannot delete client with invoices. Delete the invoices first.');
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
}

export function getClient(id: string, userId: string): ClientRecord | undefined {
  return getDb().prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(id, userId) as ClientRecord | undefined;
}

export function listClients(userId: string, opts: { search?: string; limit?: number; offset?: number } = {}): (ClientRecord & { projectCount: number })[] {
  const db = getDb();
  const limit = opts.limit || 20;
  const offset = opts.offset || 0;
  let sql = `SELECT c.*, (SELECT COUNT(*) FROM projects WHERE client_id = c.id) as projectCount FROM clients c WHERE c.user_id = ?`;
  const params: any[] = [userId];
  if (opts.search) {
    sql += ` AND (c.name LIKE ? OR c.email LIKE ? OR c.company LIKE ?)`;
    const s = `%${opts.search}%`;
    params.push(s, s, s);
  }
  sql += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params) as (ClientRecord & { projectCount: number })[];
}

export function getClientsCount(userId: string, search?: string): number {
  const db = getDb();
  let sql = `SELECT COUNT(*) as count FROM clients WHERE user_id = ?`;
  const params: any[] = [userId];
  if (search) {
    sql += ` AND (name LIKE ? OR email LIKE ? OR company LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  return (db.prepare(sql).get(...params) as { count: number }).count;
}

// ── Projects ──

export function createProject(userId: string, data: { name: string; client_id?: string; description?: string; status?: string }): ProjectRecord {
  if (!data.name?.trim()) throw new ValidationError('Project name is required');
  const validStatuses = ['active', 'completed', 'on-hold', 'archived'];
  if (data.status && !validStatuses.includes(data.status)) throw new ValidationError('Invalid status');
  if (data.client_id) {
    const client = getDb().prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(data.client_id, userId);
    if (!client) throw new ValidationError('Client not found');
  }
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');
  db.prepare(`INSERT INTO projects (id, user_id, client_id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, userId, data.client_id || null, data.name.trim(), data.description?.trim() || null, data.status || 'active', now, now
  );
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRecord;
}

export function updateProject(id: string, userId: string, data: { name?: string; client_id?: string | null; description?: string; status?: string }): ProjectRecord {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as ProjectRecord | undefined;
  if (!existing) throw new NotFoundError('Project not found');
  const validStatuses = ['active', 'completed', 'on-hold', 'archived'];
  if (data.status && !validStatuses.includes(data.status)) throw new ValidationError('Invalid status');
  if (data.client_id) {
    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(data.client_id, userId);
    if (!client) throw new ValidationError('Client not found');
  }
  const now = new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');
  db.prepare(`UPDATE projects SET name = ?, client_id = ?, description = ?, status = ?, updated_at = ? WHERE id = ?`).run(
    data.name?.trim() || existing.name,
    data.client_id !== undefined ? (data.client_id || null) : existing.client_id,
    data.description?.trim() ?? existing.description,
    data.status || existing.status,
    now, id
  );
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRecord;
}

export function deleteProject(id: string, userId: string): void {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as ProjectRecord | undefined;
  if (!existing) throw new NotFoundError('Project not found');
  const invoiceCount = (db.prepare('SELECT COUNT(*) as count FROM invoices WHERE project_id = ? AND user_id = ?').get(id, userId) as { count: number }).count;
  if (invoiceCount > 0) throw new ConflictError('Cannot delete project with invoices. Delete the invoices first.');
  db.prepare('DELETE FROM project_sites WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function getProject(id: string, userId: string): (ProjectRecord & { clientName: string | null; siteCount: number }) | undefined {
  const db = getDb();
  const row = db.prepare(`
    SELECT p.*, c.name as clientName,
      (SELECT COUNT(*) FROM project_sites WHERE project_id = p.id) as siteCount
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ? AND p.user_id = ?
  `).get(id, userId) as (ProjectRecord & { clientName: string | null; siteCount: number }) | undefined;
  return row;
}

export function listProjects(userId: string, opts: { status?: string; clientId?: string; search?: string; limit?: number; offset?: number } = {}): any[] {
  const db = getDb();
  const limit = opts.limit || 20;
  const offset = opts.offset || 0;
  let sql = `SELECT p.*, c.name as clientName,
    (SELECT COUNT(*) FROM project_sites WHERE project_id = p.id) as siteCount
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.user_id = ?`;
  const params: any[] = [userId];
  if (opts.status) { sql += ` AND p.status = ?`; params.push(opts.status); }
  if (opts.clientId) { sql += ` AND p.client_id = ?`; params.push(opts.clientId); }
  if (opts.search) { sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`; const s = `%${opts.search}%`; params.push(s, s); }
  sql += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function getProjectsCount(userId: string, opts: { status?: string; clientId?: string; search?: string } = {}): number {
  const db = getDb();
  let sql = `SELECT COUNT(*) as count FROM projects WHERE user_id = ?`;
  const params: any[] = [userId];
  if (opts.status) { sql += ` AND status = ?`; params.push(opts.status); }
  if (opts.clientId) { sql += ` AND client_id = ?`; params.push(opts.clientId); }
  if (opts.search) { sql += ` AND (name LIKE ? OR description LIKE ?)`; const s = `%${opts.search}%`; params.push(s, s); }
  return (db.prepare(sql).get(...params) as { count: number }).count;
}

export function linkSiteToProject(projectId: string, siteId: string, userId: string): void {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) throw new NotFoundError('Project not found');
  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND user_id = ?').get(siteId, userId);
  if (!site) throw new NotFoundError('Site not found');
  const id = uuidv4();
  try {
    db.prepare('INSERT INTO project_sites (id, project_id, site_id) VALUES (?, ?, ?)').run(id, projectId, siteId);
  } catch {
    throw new ConflictError('Site is already linked to this project');
  }
}

export function unlinkSiteFromProject(projectId: string, siteId: string, userId: string): void {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) throw new NotFoundError('Project not found');
  const result = db.prepare('DELETE FROM project_sites WHERE project_id = ? AND site_id = ?').run(projectId, siteId);
  if (result.changes === 0) throw new NotFoundError('Site link not found');
}

export function getProjectSites(projectId: string, userId: string): any[] {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) throw new NotFoundError('Project not found');
  return db.prepare(`
    SELECT s.id, s.subdomain, s.product_id, s.status, s.site_url, s.created_at, s.expires_at
    FROM sites s
    INNER JOIN project_sites ps ON ps.site_id = s.id
    WHERE ps.project_id = ?
    ORDER BY s.created_at DESC
  `).all(projectId);
}

// ── Invoices ──

function getNextInvoiceNumber(userId: string): string {
  const db = getDb();
  const row = db.prepare(`SELECT invoice_number FROM invoices WHERE user_id = ? ORDER BY CAST(SUBSTR(invoice_number, 5) AS INTEGER) DESC LIMIT 1`).get(userId) as { invoice_number: string } | undefined;
  if (!row) return 'INV-0001';
  const num = parseInt(row.invoice_number.substring(4), 10) + 1;
  return `INV-${String(num).padStart(4, '0')}`;
}

function calculateTotals(items: InvoiceLineItem[], taxRate: number): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

function validateItems(items: any[]): InvoiceLineItem[] {
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError('At least one line item is required');
  return items.map((item, i) => {
    if (!item.description?.trim()) throw new ValidationError(`Item ${i + 1}: description is required`);
    const qty = Number(item.qty);
    const rate = Number(item.rate);
    if (isNaN(qty) || qty <= 0) throw new ValidationError(`Item ${i + 1}: qty must be a positive number`);
    if (isNaN(rate) || rate < 0) throw new ValidationError(`Item ${i + 1}: rate must be a non-negative number`);
    return { description: item.description.trim(), qty, rate, amount: Math.round(qty * rate * 100) / 100 };
  });
}

export function createInvoice(userId: string, data: {
  client_id: string; project_id?: string; items: any[]; tax_rate?: number; due_date?: string; notes?: string; currency?: string;
}): InvoiceRecord {
  if (!data.client_id) throw new ValidationError('Client is required');
  const db = getDb();
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(data.client_id, userId);
  if (!client) throw new ValidationError('Client not found');
  if (data.project_id) {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(data.project_id, userId);
    if (!project) throw new ValidationError('Project not found');
  }
  const items = validateItems(data.items);
  const taxRate = Math.max(0, Number(data.tax_rate) || 0);
  const { subtotal, taxAmount, total } = calculateTotals(items, taxRate);
  const id = uuidv4();
  const invoiceNumber = getNextInvoiceNumber(userId);
  const now = new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, project_id, items, subtotal, tax_rate, tax_amount, total, currency, status, issue_date, due_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`).run(
    id, invoiceNumber, userId, data.client_id, data.project_id || null,
    JSON.stringify(items), subtotal, taxRate, taxAmount, total,
    data.currency?.trim() || 'USD', now, data.due_date || null, data.notes?.trim() || null, now, now
  );
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRecord;
}

export function updateInvoice(id: string, userId: string, data: {
  client_id?: string; project_id?: string | null; items?: any[]; tax_rate?: number; due_date?: string | null; notes?: string; currency?: string;
}): InvoiceRecord {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(id, userId) as InvoiceRecord | undefined;
  if (!existing) throw new NotFoundError('Invoice not found');
  if (existing.status !== 'draft') throw new ValidationError('Only draft invoices can be edited');
  if (data.client_id) {
    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(data.client_id, userId);
    if (!client) throw new ValidationError('Client not found');
  }
  if (data.project_id) {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(data.project_id, userId);
    if (!project) throw new ValidationError('Project not found');
  }
  const items = data.items ? validateItems(data.items) : JSON.parse(existing.items);
  const taxRate = data.tax_rate !== undefined ? Math.max(0, Number(data.tax_rate) || 0) : existing.tax_rate;
  const { subtotal, taxAmount, total } = calculateTotals(items, taxRate);
  const now = new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');
  db.prepare(`UPDATE invoices SET client_id = ?, project_id = ?, items = ?, subtotal = ?, tax_rate = ?, tax_amount = ?, total = ?, currency = ?, due_date = ?, notes = ?, updated_at = ? WHERE id = ?`).run(
    data.client_id || existing.client_id,
    data.project_id !== undefined ? (data.project_id || null) : existing.project_id,
    JSON.stringify(items), subtotal, taxRate, taxAmount, total,
    data.currency?.trim() || existing.currency,
    data.due_date !== undefined ? (data.due_date || null) : existing.due_date,
    data.notes?.trim() ?? existing.notes,
    now, id
  );
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRecord;
}

export function deleteInvoice(id: string, userId: string): void {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(id, userId) as InvoiceRecord | undefined;
  if (!existing) throw new NotFoundError('Invoice not found');
  if (existing.status !== 'draft') throw new ValidationError('Only draft invoices can be deleted');
  db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
}

export function getInvoice(id: string, userId: string): (InvoiceRecord & { clientName: string | null; projectName: string | null }) | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, c.name as clientName, p.name as projectName
    FROM invoices i
    LEFT JOIN clients c ON c.id = i.client_id
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE i.id = ? AND i.user_id = ?
  `).get(id, userId) as (InvoiceRecord & { clientName: string | null; projectName: string | null }) | undefined;
}

export function listInvoices(userId: string, opts: { status?: string; clientId?: string; limit?: number; offset?: number } = {}): any[] {
  const db = getDb();
  const limit = opts.limit || 20;
  const offset = opts.offset || 0;
  let sql = `SELECT i.*, c.name as clientName, p.name as projectName
    FROM invoices i
    LEFT JOIN clients c ON c.id = i.client_id
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE i.user_id = ?`;
  const params: any[] = [userId];
  if (opts.status) { sql += ` AND i.status = ?`; params.push(opts.status); }
  if (opts.clientId) { sql += ` AND i.client_id = ?`; params.push(opts.clientId); }
  sql += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function getInvoicesCount(userId: string, opts: { status?: string; clientId?: string } = {}): number {
  const db = getDb();
  let sql = `SELECT COUNT(*) as count FROM invoices WHERE user_id = ?`;
  const params: any[] = [userId];
  if (opts.status) { sql += ` AND status = ?`; params.push(opts.status); }
  if (opts.clientId) { sql += ` AND client_id = ?`; params.push(opts.clientId); }
  return (db.prepare(sql).get(...params) as { count: number }).count;
}

export function updateInvoiceStatus(id: string, userId: string, newStatus: string): InvoiceRecord {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(id, userId) as InvoiceRecord | undefined;
  if (!existing) throw new NotFoundError('Invoice not found');

  const validTransitions: Record<string, string[]> = {
    draft: ['sent', 'cancelled'],
    sent: ['paid', 'cancelled'],
    paid: ['cancelled'],
    overdue: ['paid', 'cancelled'],
    cancelled: [],
  };
  const allowed = validTransitions[existing.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new ValidationError(`Cannot change status from '${existing.status}' to '${newStatus}'`);
  }

  const now = new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');
  db.prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, id);
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRecord;
}

// ── Utility: list all clients for dropdowns ──

export function listAllClients(userId: string): { id: string; name: string; company: string | null }[] {
  return getDb().prepare('SELECT id, name, company FROM clients WHERE user_id = ? ORDER BY name').all(userId) as any[];
}

export function listAllProjects(userId: string): { id: string; name: string; client_id: string | null }[] {
  return getDb().prepare('SELECT id, name, client_id FROM projects WHERE user_id = ? ORDER BY name').all(userId) as any[];
}
