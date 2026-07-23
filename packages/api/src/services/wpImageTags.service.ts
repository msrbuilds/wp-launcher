import { ALL_PHP_VERSIONS } from './imageBuild.service';

/**
 * Discovers which WordPress versions can be built for each PHP version by reading
 * the official `wordpress` image's published tags from Docker Hub, so the panel
 * offers current releases (e.g. WordPress 7.x) without a code change. Results are
 * unioned with a verified static baseline and cached; any failure falls back to
 * the baseline so the panel keeps working offline.
 */

const HUB_TAGS_URL = 'https://hub.docker.com/v2/repositories/library/wordpress/tags/?page_size=100&ordering=last_updated';
const TAG_RE = /^(\d+\.\d+)-php(\d+\.\d+)-apache$/;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PAGES = 3;
const MAX_WP_PER_PHP = 8;

// Verified-good pairings used as a floor (and as the offline fallback). Docker
// Hub adds current releases on top of these. PHP 7.4 is legacy -> WP 6.1 only.
export const STATIC_WP_BY_PHP: Record<string, string[]> = {
  '8.5': ['6.9', '6.8', '6.7'],
  '8.4': ['6.9', '6.8', '6.7'],
  '8.3': ['6.9', '6.8', '6.7'],
  '8.2': ['6.9', '6.8', '6.7'],
  '8.1': ['6.9', '6.8', '6.7'],
  '7.4': ['6.1'],
};

/** Descending sort of "major.minor" version strings (7.0 before 6.9). */
export function sortWpDesc(versions: string[]): string[] {
  return [...versions].sort((a, b) => {
    const [aMaj, aMin] = a.split('.').map(Number);
    const [bMaj, bMin] = b.split('.').map(Number);
    return bMaj - aMaj || bMin - aMin;
  });
}

/**
 * Merge fetched (php -> WP set) tags with the static baseline, restricted to
 * supported PHP versions, sorted newest-first and capped. Pure and testable.
 */
export function shapeMatrix(fetched: Record<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const php of ALL_PHP_VERSIONS) {
    const merged = new Set<string>(STATIC_WP_BY_PHP[php] || []);
    for (const wp of fetched[php] || []) merged.add(wp);
    if (merged.size) out[php] = sortWpDesc([...merged]).slice(0, MAX_WP_PER_PHP);
  }
  return out;
}

/** True when (php, wp) is an offered/buildable pairing in the matrix. */
export function isBuildable(matrix: Record<string, string[]>, php: string, wp: string): boolean {
  return !!matrix[php]?.includes(wp);
}

let cache: { at: number; data: Record<string, string[]> } | null = null;

export async function getBuildableWpByPhp(): Promise<Record<string, string[]>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const fetched: Record<string, Set<string>> = {};
    let url: string | null = HUB_TAGS_URL;
    for (let page = 0; page < MAX_PAGES && url; page++) {
      const res: Response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) break;
      const json: any = await res.json();
      for (const t of json.results || []) {
        const m = (t.name || '').match(TAG_RE);
        if (!m) continue;
        const wp = m[1];
        const php = m[2];
        (fetched[php] ??= new Set()).add(wp);
      }
      url = json.next || null;
    }
    const data = shapeMatrix(fetched);
    if (Object.keys(data).length) {
      cache = { at: Date.now(), data };
      return data;
    }
  } catch {
    // network/parse failure -- fall through to the static baseline
  }
  return shapeMatrix({});
}

/** Test-only: clear the in-memory cache. */
export function __resetWpTagsCache(): void {
  cache = null;
}
