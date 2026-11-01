/**
 * Sliding-window counters for agent traffic. Tools call services directly, so
 * the REST routes' express-rate-limit buckets never see them; these mirror the
 * same intent. In memory: they reset on restart, which is acceptable for the
 * single API process this runs in.
 */
const WINDOW_MS = 15 * 60 * 1000;
const WRITE_LIMITS = { sites: 10, crm: 60, admin: 60 } as const;
const GRANT_LIMIT = 300;

const hits = new Map<string, number[]>();

function consume(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function consumeGrantRequest(grantId: string): boolean {
  return consume(`grant:${grantId}`, GRANT_LIMIT);
}

export function consumeWrite(bucket: keyof typeof WRITE_LIMITS, userId: string): boolean {
  return consume(`write:${bucket}:${userId}`, WRITE_LIMITS[bucket]);
}

export function __resetLimitsForTesting(): void {
  hits.clear();
}
