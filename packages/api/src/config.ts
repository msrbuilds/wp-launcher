const KNOWN_DEV_DEFAULTS = ['dev-api-key', 'dev-jwt-secret-change-me'];

function requireSecret(envVar: string, fallback: string): string {
  const value = process.env[envVar] || fallback;
  if (process.env.NODE_ENV === 'production' && KNOWN_DEV_DEFAULTS.includes(value)) {
    console.error(`[FATAL] ${envVar} is set to an insecure default. Set a strong secret before running in production.`);
    process.exit(1);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: requireSecret('API_KEY', 'dev-api-key'),
  baseDomain: process.env.BASE_DOMAIN || 'localhost',
  wpImage: process.env.WP_IMAGE || 'wp-launcher/wordpress:latest',
  dataDir: process.env.DATA_DIR || './data',
  productConfigsDir: process.env.PRODUCT_CONFIGS_DIR || './products',

  // JWT
  jwtSecret: requireSecret('JWT_SECRET', 'dev-jwt-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // SMTP for sending verification emails
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'WP Launcher <noreply@localhost>',
  },

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
    maxExpiration: '24h',
    maxConcurrentSites: 50,
    maxTotalSites: parseInt(process.env.MAX_TOTAL_SITES || '50', 10),
  },

  // Cleanup interval in milliseconds
  cleanupInterval: 60_000, // 1 minute
};

export function parseExpiration(expiration: string): number {
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
