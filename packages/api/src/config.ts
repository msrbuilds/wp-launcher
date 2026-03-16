const KNOWN_DEV_DEFAULTS = ['dev-api-key', 'dev-jwt-secret-change-me'];

const appMode = (process.env.APP_MODE || 'agency') as 'local' | 'agency';
const isLocalMode = appMode === 'local';

function requireSecret(envVar: string, fallback: string): string {
  if (isLocalMode) return process.env[envVar] || fallback;
  const value = process.env[envVar] || fallback;
  if (process.env.NODE_ENV === 'production' && KNOWN_DEV_DEFAULTS.includes(value)) {
    console.error(`[FATAL] ${envVar} is set to an insecure default. Set a strong secret before running in production.`);
    process.exit(1);
  }
  return value;
}

export const config = {
  appMode,
  isLocalMode,
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: requireSecret('API_KEY', 'dev-api-key'),
  baseDomain: process.env.BASE_DOMAIN || 'localhost',
  wpImage: process.env.WP_IMAGE || 'wp-launcher/wordpress:latest',
  dataDir: process.env.DATA_DIR || './data',
  productConfigsDir: process.env.PRODUCT_CONFIGS_DIR || './products',
  templateConfigsDir: process.env.TEMPLATE_CONFIGS_DIR || './templates',

  // JWT
  jwtSecret: requireSecret('JWT_SECRET', 'dev-jwt-secret-change-me'),
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

  // Defaults for demo sites
  defaults: {
    expiration: '1h',
    maxConcurrentSites: 50,
    maxTotalSites: isLocalMode ? 0 : parseInt(process.env.MAX_TOTAL_SITES || '50', 10),
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
