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

/**
 * Stats are install-wide, so the panel requires an owner/admin caller. The
 * extension authenticates with the panel's API key; without one the request is
 * rejected and this resolves to null so callers can show a clear message
 * rather than rendering NaN.
 */
export async function fetchTodayStats(apiUrl: string, apiKey?: string): Promise<TodayStats | null> {
  const url = new URL('/api/productivity/stats/today', apiUrl);
  const transport = url.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  return new Promise((resolve) => {
    const req = transport.get(url, { timeout: 5000, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(data) as TodayStats;
          resolve(typeof parsed?.totalSeconds === 'number' ? parsed : null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
