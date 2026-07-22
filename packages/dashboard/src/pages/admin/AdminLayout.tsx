import { createContext, useContext } from 'react';
import { useAuth } from '../../context/AuthContext';

interface AdminFetchOpts {
  headers: Record<string, string>;
  credentials: RequestCredentials;
}

/**
 * Retained after the shell rewrite: pages call useAdminHeaders() for their
 * fetches. Auth is cookie-based, so the header bag is empty by design — the
 * context exists so pages do not each hardcode `credentials: 'include'`.
 */
const AdminHeadersContext = createContext<AdminFetchOpts>({ headers: {}, credentials: 'include' });

export function useAdminHeaders(): Record<string, string> {
  return useContext(AdminHeadersContext).headers;
}

export function useAdminFetch(): AdminFetchOpts {
  return useContext(AdminHeadersContext);
}

export function useAdminAuth() {
  const { isAdmin } = useAuth();
  return { isAdmin };
}
