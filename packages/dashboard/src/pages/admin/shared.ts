export const PAGE_SIZE = 20;

export interface Stats {
  totalSitesCreated: number;
  activeSites: number;
  totalUsers: number;
  verifiedUsers: number;
}

export interface User {
  id: string;
  email: string;
  verified: boolean;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteLog {
  id: number;
  site_id: string;
  user_id: string | null;
  user_email: string | null;
  product_id: string;
  subdomain: string;
  site_url: string | null;
  action: string;
  created_at: string;
}

export interface AdminSite {
  id: string;
  subdomain: string;
  blueprintId: string;
  userId: string | null;
  url: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
  deletedAt: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminProduct {
  id: string;
  name: string;
  database?: string;
  branding?: { description?: string };
}

/**
 * `requires` records a genuine environment dependency, not a mode. Every
 * feature is toggleable on every install; this only drives an advisory hint
 * when the current install cannot fully support it.
 */
export const FEATURE_META: {
  key: string;
  label: string;
  description: string;
  requires?: 'publicDomain' | 'smtp';
}[] = [
  { key: 'cloning', label: 'Site Cloning', description: 'Clone a running site into a new one' },
  { key: 'snapshots', label: 'Snapshots', description: 'Take and restore point-in-time site snapshots' },
  { key: 'templates', label: 'Save as Blueprint', description: 'Export a running site as a reusable blueprint' },
  { key: 'customDomains', label: 'Custom Domains', description: 'Point a custom domain at a site', requires: 'publicDomain' },
  { key: 'phpConfig', label: 'PHP Configuration', description: 'Change PHP settings on a running site' },
  { key: 'siteExtend', label: 'Site Extend', description: 'Push back a site expiry date' },
  { key: 'sitePassword', label: 'Site Password Protection', description: 'Put a password in front of a site' },
  { key: 'exportZip', label: 'Export Site as ZIP', description: 'Download a site as a portable ZIP archive' },
  { key: 'webhooks', label: 'Webhook Notifications', description: 'Fire HTTP webhooks on site events (created, expired, deleted)' },
  { key: 'healthMonitoring', label: 'Site Health Monitoring', description: 'Track container CPU and memory for running sites' },
  { key: 'scheduledLaunch', label: 'Scheduled Site Launch', description: 'Queue sites to be created at a future time' },
  { key: 'collaborativeSites', label: 'Collaborative Sites', description: 'Share a site with another user as viewer or admin', requires: 'smtp' },
  { key: 'adminer', label: 'Database Manager (Adminer)', description: 'Browse and edit site databases through Adminer' },
  { key: 'publicSharing', label: 'Public Sharing (Tunnels)', description: 'Expose a site publicly via LAN, Cloudflare Tunnel, or ngrok' },
  { key: 'siteSync', label: 'Site Sync', description: 'Push and pull site content between this panel and remote instances' },
  { key: 'projects', label: 'Projects & Invoices', description: 'Manage clients, projects, and generate invoices' },
  { key: 'productivityMonitor', label: 'Productivity Monitor', description: 'Track coding time and WordPress activity with daily goals and breakdowns' },
];

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  projectCount?: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  client_id: string | null;
  clientName?: string;
  name: string;
  description: string | null;
  status: 'active' | 'completed' | 'on-hold' | 'archived';
  siteCount?: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  clientName?: string;
  project_id: string | null;
  projectName?: string;
  items: InvoiceLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
