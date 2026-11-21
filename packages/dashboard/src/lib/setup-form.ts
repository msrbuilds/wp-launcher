import { evaluatePassword } from './password-strength';

// GitHub #15: "Create Owner Account does nothing". The setup page disabled its
// button without saying why, showed a raw JSON parse error for non-JSON
// replies, and gave no hint for the two install problems behind most reports —
// opening the panel at an address other than PUBLIC_URL, and plain HTTP on a
// production install, where the secure sign-in cookie is silently dropped.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What still stops the form being submitted, in reading order. Empty means ready. */
export function setupBlockers(form: { email: string; password: string; confirm: string; minLength: number }): string[] {
  const out: string[] = [];
  const email = form.email.trim();
  if (!email) out.push('Enter your email address');
  else if (!EMAIL.test(email)) out.push('Enter a valid email address');

  if (form.password.length < form.minLength) {
    const short = form.minLength - form.password.length;
    out.push(`Password needs ${short} more character${short === 1 ? '' : 's'} (at least ${form.minLength})`);
  } else if (!evaluatePassword(form.password, form.minLength).ok) {
    out.push('Choose a stronger password: mix upper and lower case, numbers and symbols');
  }

  if (!form.confirm) out.push('Confirm your password');
  else if (form.confirm !== form.password) out.push("The two passwords don't match");
  return out;
}

/**
 * A setup failure in terms of what to do about it. `status` 0 means the request
 * never got a response. `body` is the parsed JSON, or null when the reply was
 * not JSON (a proxy's HTML error page, say).
 */
export function describeSetupFailure(status: number, body: { error?: unknown } | null, pageOrigin: string): string {
  const message = typeof body?.error === 'string' ? body.error : '';
  if (status === 0) {
    return 'Could not reach the panel API. Check that the api container is running (docker compose ps) and try again.';
  }
  if (status === 403 && message.startsWith('CSRF validation failed')) {
    return `The panel refused this request because it came from ${pageOrigin}, which is not the panel's address. `
      + 'Open the panel at the exact URL in PUBLIC_URL in your .env (same http/https, and the domain rather than the IP address), then try again.';
  }
  if (status === 409) return 'Setup has already been completed on this install. Sign in with the owner account instead.';
  if (status === 429) return 'Too many attempts. Wait 15 minutes, then try again.';
  if (message) return message;
  return `Setup failed: the server answered ${status} without an explanation. Check the api container's logs (docker compose logs api).`;
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '::1';
}

/**
 * Plain HTTP to a real host: the API marks its sign-in cookie Secure in
 * production, so the browser discards it and you are signed out again at once.
 */
export function insecureContextWarning(protocol: string, hostname: string): string | null {
  if (protocol !== 'http:' || isLocalHost(hostname)) return null;
  return 'This page is open over plain HTTP. On a server install, sign-in only works over HTTPS: open the panel at its https:// address. '
    + 'If HTTPS is not working yet, check that your domain points at this server and that the certificate has been issued.';
}
