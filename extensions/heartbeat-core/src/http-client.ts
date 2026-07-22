import * as http from 'http';
import * as https from 'https';
import { HeartbeatPayload, TodayStats } from './types';

export async function postHeartbeats(apiUrl: string, heartbeats: HeartbeatPayload[], secret?: string): Promise<boolean> {
  const url = new URL('/api/productivity/heartbeats', apiUrl);
  const body = JSON.stringify({ heartbeats, secret });
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = transport.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve(res.statusCode === 200);
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

export type StatsResult =
  | { ok: true; stats: TodayStats }
  | { ok: false; reason: 'auth' | 'network' | 'bad-response'; status?: number; detail?: string };

/**
 * Stats are install-wide, so the panel requires an owner/admin caller and the
 * extension authenticates with the panel's API key. Returns a discriminated
 * result rather than null so callers can tell "wrong key" from "panel is down"
 * instead of showing one uninformative placeholder for every failure.
 */
export async function fetchTodayStatsResult(apiUrl: string, apiKey?: string): Promise<StatsResult> {
  let url: URL;
  try {
    url = new URL('/api/productivity/stats/today', apiUrl);
  } catch {
    return { ok: false, reason: 'network', detail: `Invalid API URL: ${apiUrl}` };
  }
  const transport = url.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = {};
  // Trim: a key pasted into settings often carries stray whitespace, which
  // would otherwise fail the panel's constant-time comparison.
  const key = apiKey?.trim();
  if (key) headers['x-api-key'] = key;

  return new Promise((resolve) => {
    const req = transport.get(url, { timeout: 5000, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        if (status === 401 || status === 403) {
          resolve({ ok: false, reason: 'auth', status, detail: data.slice(0, 200) });
          return;
        }
        if (status !== 200) {
          resolve({ ok: false, reason: 'bad-response', status, detail: data.slice(0, 200) });
          return;
        }
        try {
          const parsed = JSON.parse(data) as TodayStats;
          if (typeof parsed?.totalSeconds === 'number') {
            resolve({ ok: true, stats: parsed });
          } else {
            resolve({ ok: false, reason: 'bad-response', status, detail: data.slice(0, 200) });
          }
        } catch {
          resolve({ ok: false, reason: 'bad-response', status, detail: data.slice(0, 200) });
        }
      });
    });

    req.on('error', (err) => resolve({ ok: false, reason: 'network', detail: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, reason: 'network', detail: 'Request timed out' });
    });
  });
}

/** Backwards-compatible wrapper. */
export async function fetchTodayStats(apiUrl: string, apiKey?: string): Promise<TodayStats | null> {
  const result = await fetchTodayStatsResult(apiUrl, apiKey);
  return result.ok ? result.stats : null;
}
