import crypto from 'crypto';

/**
 * A site's database password.
 *
 * Must not be derivable from anything an attacker can see. The previous scheme
 * combined the subdomain — which is the site's public hostname — with a
 * millisecond timestamp, leaving a search space small enough to brute-force
 * from any container that could reach the sidecar's port 3306.
 */
export function generateDbPassword(): string {
  return crypto.randomBytes(24).toString('base64url');
}
