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

export const FEATURE_META: { key: string; label: string; description: string }[] = [
  { key: 'cloning', label: 'Site Cloning', description: 'Allow users to clone their running sites' },
  { key: 'snapshots', label: 'Snapshots', description: 'Allow users to take and restore site snapshots' },
  { key: 'templates', label: 'Save as Template', description: 'Allow users to export running sites as reusable templates' },
  { key: 'customDomains', label: 'Custom Domains', description: 'Allow users to set custom domains on their sites (agency mode only)' },
  { key: 'phpConfig', label: 'PHP Configuration', description: 'Allow users to modify PHP settings on running sites' },
];
