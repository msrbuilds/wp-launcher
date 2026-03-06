export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: process.env.API_KEY || 'dev-api-key',
  baseDomain: process.env.BASE_DOMAIN || 'localhost',
  dockerNetwork: process.env.DOCKER_NETWORK || 'wp-launcher-network',
  wpImage: process.env.WP_IMAGE || 'wp-launcher/wordpress:latest',
  dataDir: process.env.DATA_DIR || './data',
  productConfigsDir: process.env.PRODUCT_CONFIGS_DIR || './products',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
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

  // Defaults for demo sites
  defaults: {
    expiration: '1h',
    maxExpiration: '24h',
    maxConcurrentSites: 50,
    containerMemoryLimit: 256 * 1024 * 1024, // 256MB
    containerCpuLimit: 0.5, // 50% of one CPU core
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
