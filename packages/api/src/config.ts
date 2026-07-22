import { ensureSecrets } from './utils/secrets';

const dataDir = process.env.DATA_DIR || './data';

// Every install gets strong secrets whether or not the operator set any.
// Environment variables still take precedence.
const generated = ensureSecrets(dataDir);

export const config = {
  port: parseInt(process.env.PORT || '3737', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: process.env.API_KEY || generated.apiKey,
  baseDomain: process.env.BASE_DOMAIN || 'localhost',
  wpImage: process.env.WP_IMAGE || 'wp-launcher/wordpress:latest',
  dataDir,
  sitesDir: process.env.SITES_DIR || '',  // Container-internal path to sites directory (for cleanup)
  sitesHostPath: process.env.SITES_HOST_PATH || '',  // Host path to sites directory (exposed to dashboard)
  blueprintConfigsDir: process.env.BLUEPRINT_CONFIGS_DIR || './blueprints',
  // Legacy directories, read once by the blueprints migration then unused.
  legacyProductConfigsDir: process.env.PRODUCT_CONFIGS_DIR || './products',
  legacyTemplateConfigsDir: process.env.TEMPLATE_CONFIGS_DIR || './templates',

  // JWT
  jwtSecret: process.env.JWT_SECRET || generated.jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Email provider: 'smtp' (default) or 'brevo' (HTTP API, bypasses SMTP port blocks)
  emailProvider: (process.env.EMAIL_PROVIDER || 'smtp') as 'smtp' | 'brevo',

  // SMTP for sending verification emails
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'WP Launcher <noreply@localhost>',
  },

  // Brevo HTTP API (alternative to SMTP — works when SMTP ports are blocked)
  brevoApiKey: process.env.BREVO_API_KEY || process.env.SMTP_PASS || '',

  // Public URL for email links
  publicUrl: process.env.PUBLIC_URL || 'http://localhost',

  // CORS allowed origins — explicit allowlist; falls back to publicUrl + baseDomain when unset
  corsOrigins: process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : [
        process.env.PUBLIC_URL || 'http://localhost',
        `https://${process.env.BASE_DOMAIN || 'localhost'}`,
        `http://${process.env.BASE_DOMAIN || 'localhost'}`,
      ],

  // Defaults for new sites. Site quotas now live in the settings table and are
  // read through `policy` — see policy.quotaForRole / policy.totalSiteQuota.
  defaults: {
    expiration: '1h',
    maxConcurrentSites: 50,
  },

  // Cleanup interval in milliseconds
  cleanupInterval: 60_000, // 1 minute

  // Admin bootstrap (used on first start, then removed from .env)
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  // Dashboard UI settings
  ui: {
    cardLayout: (process.env.CARD_LAYOUT || 'full') as 'full' | 'compact',
  },
};

export function parseExpiration(expiration: string): number {
  if (expiration === 'never' || expiration === '0') return 0;

  const match = expiration.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid expiration format: ${expiration}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 3600 * 1000;
    case 'd': return value * 86400 * 1000;
    default: throw new Error(`Invalid expiration unit: ${unit}`);
  }
}

export function parseMaxExpiration(maxExp: string): number {
  return parseExpiration(maxExp);
}
