import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import CountdownTimer from '../components/CountdownTimer';

interface Site {
  id: string;
  subdomain: string;
  productId: string;
  url: string;
  adminUrl: string;
  credentials?: { username: string; password: string };
  status: string;
  createdAt: string;
  expiresAt: string;
}

export default function SitesListPage() {
  const { isAuthenticated, token } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  function fetchSites() {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch('/api/sites', { headers })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSites(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    fetchSites();
    const interval = setInterval(fetchSites, 10_000);
    return () => clearInterval(interval);
  }, [token]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this demo site?')) return;

    await fetch(`/api/sites/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    fetchSites();
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <span className="spinner" /> Loading sites...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="card empty-state">
        <h3>Log in to see your sites</h3>
        <p>
          <a href="/login">Log in</a> or <a href="/">create an account</a> to manage your demo sites.
        </p>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="card empty-state">
        <h3>No active sites</h3>
        <p>Launch a demo site to see it here.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginBottom: '1rem' }}>
        My Sites ({sites.length})
      </h2>

      {sites.map((site) => (
        <div key={site.id} className="site-list-item">
          <div className="site-info">
            <h4>
              <a href={site.url} target="_blank" rel="noopener noreferrer">
                {site.subdomain}
              </a>
              <span className={`badge badge-${site.status}`} style={{ marginLeft: '0.5rem' }}>
                {site.status}
              </span>
            </h4>
            {site.credentials && (
              <div className="meta" style={{ marginBottom: '0.25rem' }}>
                Login: <code>{site.credentials.username}</code> / <code>{site.credentials.password}</code>
              </div>
            )}
            <div className="meta">
              Product: {site.productId} &bull;{' '}
              Expires: <CountdownTimer expiresAt={site.expiresAt} />
            </div>
          </div>
          <div className="site-actions">
            <a
              href={site.adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-primary"
            >
              WP Admin
            </a>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => handleDelete(site.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
