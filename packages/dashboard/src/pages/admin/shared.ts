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
  productId: string;
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

export const FEATURE_META: { key: string; label: string; description: string; agencyOnly?: boolean; localOnly?: boolean }[] = [
  { key: 'cloning', label: 'Site Cloning', description: 'Allow users to clone their running sites' },
  { key: 'snapshots', label: 'Snapshots', description: 'Allow users to take and restore site snapshots' },
  { key: 'templates', label: 'Save as Template', description: 'Allow users to export running sites as reusable templates', localOnly: true },
  { key: 'customDomains', label: 'Custom Domains', description: 'Allow users to set custom domains on their sites', agencyOnly: true },
  { key: 'phpConfig', label: 'PHP Configuration', description: 'Allow users to modify PHP settings on running sites' },
  { key: 'siteExtend', label: 'Site Extend', description: 'Allow users to extend the expiration of their running sites', agencyOnly: true },
  { key: 'sitePassword', label: 'Site Password Protection', description: 'Allow users to set a password on their demo site frontend' },
  { key: 'exportZip', label: 'Export Site as ZIP', description: 'Allow users to download their site as a portable ZIP archive' },
  { key: 'webhooks', label: 'Webhook Notifications', description: 'Fire HTTP webhooks on site events (created, expired, deleted)', agencyOnly: true },
  { key: 'healthMonitoring', label: 'Site Health Monitoring', description: 'Track container CPU and memory usage for running sites' },
  { key: 'scheduledLaunch', label: 'Scheduled Site Launch', description: 'Allow users to schedule sites to be created at a future time', agencyOnly: true },
  { key: 'collaborativeSites', label: 'Collaborative Sites', description: 'Allow users to share sites with other users (viewer or admin access)', agencyOnly: true },
  { key: 'adminer', label: 'Database Manager (Adminer)', description: 'Allow users to access and manage site databases through Adminer' },
  { key: 'publicSharing', label: 'Public Sharing (Tunnels)', description: 'Share sites publicly via LAN, Cloudflare Tunnel, or ngrok' },
  { key: 'siteSync', label: 'Site Sync', description: 'Push/pull site content between local and remote instances', localOnly: true },
  { key: 'projects', label: 'Projects & Invoices', description: 'Manage clients, projects, and generate invoices' },
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
