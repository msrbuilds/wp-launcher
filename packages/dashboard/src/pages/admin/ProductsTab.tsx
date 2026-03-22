import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminProduct } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import { apiFetch } from '../../utils/api';

export default function ProductsTab() {
  const headers = useAdminHeaders();
  const navigate = useNavigate();
  const isLocal = useIsLocalMode();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const noun = isLocal ? 'template' : 'product';
  const Noun = isLocal ? 'Template' : 'Product';
  const apiBase = isLocal ? '/api/templates' : '/api/products';

  const fetchProducts = useCallback(() => {
    setLoading(true);
    apiFetch(apiBase)
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
      const res = await apiFetch(`${apiBase}/${id}`, { method: 'DELETE', headers });
      if (!res.ok) { const data = await res.json(); alert(data.error || `Failed to delete ${noun}`); }
    } catch { alert(`Failed to delete ${noun}`); }
    finally { setDeleting(null); fetchProducts(); }
  }

  if (loading && products.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <div className="pt-header">
        <h3 className="pt-title">{Noun}s ({products.length})</h3>
        <button className="btn btn-primary btn-sm" onClick={() => navigate(isLocal ? '/create-template' : '/create-product')}>+ New {Noun}</button>
      </div>
      {products.length === 0 ? (
        <p className="pt-empty">No {noun}s configured.</p>
      ) : (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Database</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td><code>{p.id}</code></td>
                  <td>{p.name}</td>
                  <td>{p.database || 'sqlite'}</td>
                  <td className="pt-desc-cell">{p.branding?.description || '—'}</td>
                  <td>
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
