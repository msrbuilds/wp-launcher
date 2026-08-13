/**
 * Blueprint reads are public so the launch page and demo portal can list them
 * anonymously — but only in their sanitized form. `?full=true` returns the raw
 * blueprint, including docker config, plugin lists and `demo.admin_email`, which
 * `sanitizeBlueprint` strips precisely because anonymous callers must not see
 * them. That payload is admin-only; the blueprint editor is its one legitimate
 * consumer.
 */
export function needsAdminForBlueprintRequest(
  method: string,
  query: Record<string, unknown>,
): boolean {
  if (method !== 'GET') return true;
  const full = query.full;
  // Express turns a repeated ?full= into an array, so check both shapes rather
  // than only the string — otherwise `?full=true&full=x` would slip through.
  if (Array.isArray(full)) return full.includes('true');
  return full === 'true';
}
