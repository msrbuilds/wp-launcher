import { useState, useEffect, useCallback } from 'react';
import { AdminProduct } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';

export default function ProductsTab() {
  const headers = useAdminHeaders();
  const isLocal = useIsLocalMode();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const noun = isLocal ? 'template' : 'product';
  const Noun = isLocal ? 'Template' : 'Product';
  const apiBase = isLocal ? '/api/templates' : '/api/products';

  const fetchProducts = useCallback(() => {
    setLoading(true);
    fetch(apiBase, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setProducts(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${noun} "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE', headers, credentials: 'include' });
      if (!res.ok) { const data = await res.json(); alert(data.error || `Failed to delete ${noun}`); }
    } catch { alert(`Failed to delete ${noun}`); }
    finally { setDeleting(null); fetchProducts(); }
  }

  if (loading && products.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>{Noun}s ({products.length})</h3>
      {products.length === 0 ? (
        <p style={{ color: '#64748b' }}>No {noun}s configured.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>ID</th>
                <th style={{ padding: '0.5rem' }}>Name</th>
                <th style={{ padding: '0.5rem' }}>Database</th>
                <th style={{ padding: '0.5rem' }}>Description</th>
                <th style={{ padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.5rem' }}><code>{p.id}</code></td>
                  <td style={{ padding: '0.5rem' }}>{p.name}</td>
                  <td style={{ padding: '0.5rem' }}>{p.database || 'sqlite'}</td>
                  <td style={{ padding: '0.5rem', color: '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.branding?.description || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id, p.name)} disabled={deleting === p.id}>
                      {deleting === p.id ? <><span className="spinner" /> Deleting...</> : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
