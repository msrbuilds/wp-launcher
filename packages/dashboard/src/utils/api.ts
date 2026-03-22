/**
 * Fetch wrapper that automatically includes CSRF protection headers
 * and cookie credentials on every request.
 */

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);

  // Always include the CSRF custom header for state-changing requests
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}
