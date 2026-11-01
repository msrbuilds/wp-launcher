/**
 * The `?next=` target after login. Only same-origin relative paths are
 * accepted, so a crafted link cannot bounce a freshly signed-in user to another
 * site (`//evil.com` and `/\evil.com` are both protocol-relative to a browser).
 */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw) || /%0[ad]/i.test(raw)) return null;
  return raw;
}
