import { useState, useEffect, useRef, useCallback } from 'react';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ContainerInfo {
  id: string;
  idFull: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  labels: Record<string, string>;
  siteId: string;
  dbStatus: string | null;
  expiresAt: string | null;
  flag: 'normal' | 'stale' | 'orphaned' | 'leftover';
  cpuPercent: number | null;
  memUsage: number | null;
  memLimit: number | null;
}

interface SystemInfo {
  docker: {
    version: string;
    containersRunning: number;
    containersPaused: number;
    containersStopped: number;
    containersTotal: number;
    images: number;
  };
  host: {
    cpuModel: string;
    cpuCores: number;
    cpuPhysicalCores: number;
    loadAvg: number[];
    memTotal: number;
    memUsed: number;
    memFree: number;
    memPercent: number;
    disk: { fs: string; mount: string; size: number; used: number; available: number; usePercent: number }[];
  };
}

interface DiskInfo {
  images: { count: number; totalSize: number; items: { id: string; repoTags: string[]; size: number; created: number }[] };
  volumes: { count: number; items: { name: string; driver: string }[] };
}

interface ChartPoint {
  time: string;
  ts: number;
  cpuUser: number;
  cpuSystem: number;
  memPercent: number;
  memUsedGB: number;
  diskPercent: number;
}

const MAX_POINTS = 60; // 10 minutes at 10s intervals

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatUptime(created: number): string {
  const diff = Math.floor(Date.now() / 1000 - created);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 86400)}d ${Math.floor((diff % 86400) / 3600)}h`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

const chartTooltipStyle = { backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem' };

export default function MonitoringPage() {
  const headers = useAdminHeaders();
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [counts, setCounts] = useState({ normal: 0, stale: 0, orphaned: 0, leftover: 0 });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [disk, setDisk] = useState<DiskInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const chartPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [cRes, sRes, dRes] = await Promise.all([
        apiFetch('/api/admin/monitoring/containers', { headers }),
        apiFetch('/api/admin/monitoring/system', { headers }),
        apiFetch('/api/admin/monitoring/disk', { headers }),
      ]);
      const cData = await cRes.json();
      const sData = await sRes.json();
      const dData = await dRes.json();
      setContainers(cData.containers || []);
      setCounts(cData.counts || { normal: 0, stale: 0, orphaned: 0, leftover: 0 });
      setSystem(sData);
      setDisk(dData);
      return sData as SystemInfo;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSystemForChart = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/monitoring/system', { headers });
      if (!res.ok) return;
      const data = await res.json() as SystemInfo;
      if (!data?.host) return;
      const mainDisk = data.host.disk?.find((d: any) => d.mount === '/' || d.mount === 'C:');
      const now = Date.now();
      const point: ChartPoint = {
        time: formatTime(now),
        ts: now,
        cpuUser: data.host.loadAvg?.[1] ?? 0,
        cpuSystem: data.host.loadAvg?.[2] ?? 0,
        memPercent: data.host.memPercent ?? 0,
        memUsedGB: Math.round(((data.host.memUsed || 0) / (1024 * 1024 * 1024)) * 100) / 100,
        diskPercent: mainDisk?.usePercent ?? 0,
      };
      setChartData(prev => [...prev.slice(-(MAX_POINTS - 1)), point]);
      setSystem(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchAll().then(sData => {
      if (sData?.host) {
        const mainDisk = sData.host.disk?.find(d => d.mount === '/' || d.mount === 'C:');
        const now = Date.now();
        setChartData([{
          time: formatTime(now),
          ts: now,
          cpuUser: sData.host.loadAvg?.[1] ?? 0,
          cpuSystem: sData.host.loadAvg?.[2] ?? 0,
          memPercent: sData.host.memPercent ?? 0,
          memUsedGB: Math.round(((sData.host.memUsed || 0) / (1024 * 1024 * 1024)) * 100) / 100,
          diskPercent: mainDisk?.usePercent ?? 0,
        }]);
      }
    });
    // Start chart polling (every 10s)
    chartPollRef.current = setInterval(fetchSystemForChart, 10000);
    return () => { if (chartPollRef.current) clearInterval(chartPollRef.current); };
  }, [fetchAll, fetchSystemForChart]);

  const doAction = async (url: string, label: string) => {
    if (!confirm(`Are you sure you want to ${label}?`)) return;
    setActionLoading(label);
    setActionMsg(null);
    try {
      const res = await apiFetch(url, { method: 'POST', headers });
      const data = await res.json();
      const msg = data.message || (data.spaceReclaimed !== undefined
        ? `Reclaimed ${formatBytes(data.spaceReclaimed)}`
        : data.pruned !== undefined
          ? `Pruned ${data.pruned} item(s), reclaimed ${formatBytes(data.spaceReclaimed || 0)}`
          : 'Done');
      setActionMsg(msg);
      await fetchAll();
    } catch {
      setActionMsg('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const forceRemove = async (containerId: string, name: string) => {
    if (!confirm(`Force remove container "${name}"?`)) return;
    setActionLoading(containerId);
    try {
      await apiFetch(`/api/admin/monitoring/containers/${containerId}/force-remove`, { method: 'POST', headers });
      await fetchAll();
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  };

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading monitoring data...</div>;

  const mainDisk = system?.host?.disk?.find(d => d.mount === '/' || d.mount === 'C:');

  return (
    <div>
      {/* Header */}
      <div className="mn-header">
        <h2 className="mn-title">Server Monitoring</h2>
        <div className="mn-header-actions">
          <span className="mn-live-dot" /> <span className="mn-live-label">Live (10s)</span>
          <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); fetchAll(); }}>Refresh</button>
        </div>
      </div>

      {actionMsg && <div className="alert-success mn-alert">{actionMsg}</div>}

      {/* System Resources Cards */}
      {system?.host && (
        <div className="mn-stats-grid">
          <div className="card mn-stat-card">
            <div className="mn-stat-label">CPU Load</div>
            <div className="mn-stat-value">{system.host.loadAvg?.[0] ?? 0}%</div>
            <div className="mn-stat-sub">{system.host.cpuCores} cores &middot; {system.host.cpuModel}</div>
          </div>
          <div className="card mn-stat-card">
            <div className="mn-stat-label">Memory</div>
            <div className="mn-stat-value">{system.host.memPercent ?? 0}%</div>
            <div className="mn-stat-sub">{formatBytes(system.host.memUsed || 0)} / {formatBytes(system.host.memTotal || 0)}</div>
            <div className="mn-bar"><div className="mn-bar-fill" style={{ width: `${Math.min(system.host.memPercent ?? 0, 100)}%`, background: (system.host.memPercent ?? 0) > 85 ? '#ef4444' : 'var(--orange)' }} /></div>
          </div>
          <div className="card mn-stat-card">
            <div className="mn-stat-label">Docker Engine</div>
            <div className="mn-stat-value">{system.docker.containersRunning} running</div>
            <div className="mn-stat-sub">v{system.docker.version} &middot; {system.docker.images} images &middot; {system.docker.containersTotal} total</div>
          </div>
          {mainDisk && (
            <div className="card mn-stat-card">
              <div className="mn-stat-label">Disk ({mainDisk.mount})</div>
              <div className="mn-stat-value">{mainDisk.usePercent}%</div>
              <div className="mn-stat-sub">{formatBytes(mainDisk.used)} / {formatBytes(mainDisk.size)}</div>
              <div className="mn-bar"><div className="mn-bar-fill" style={{ width: `${Math.min(mainDisk.usePercent, 100)}%`, background: mainDisk.usePercent > 85 ? '#ef4444' : 'var(--orange)' }} /></div>
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="mn-charts-grid">
          {/* CPU Usage Chart */}
          <div className="card mn-chart-card">
            <h3 className="mn-chart-title">CPU Usage</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 'auto']} unit="%" />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem' }} />
                <Area type="monotone" dataKey="cpuUser" name="user" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="cpuSystem" name="system" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Memory Usage Chart */}
          <div className="card mn-chart-card">
            <h3 className="mn-chart-title">Memory Usage</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem' }} />
                <Area type="monotone" dataKey="memPercent" name="usage %" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Disk Usage Chart */}
          <div className="card mn-chart-card">
            <h3 className="mn-chart-title">Disk Usage</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem' }} />
                <Area type="monotone" dataKey="diskPercent" name="disk usage" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Docker Containers */}
      <div className="card">
        <div className="mn-section-header">
          <h3 className="mn-section-title">
            Docker Containers ({containers.length})
          </h3>
          <div className="mn-section-actions">
            {counts.stale > 0 && (
              <button className="btn btn-sm btn-danger" disabled={actionLoading !== null}
                onClick={() => doAction('/api/admin/monitoring/cleanup/stale', 'cleanup stale containers')}>
                Cleanup Stale ({counts.stale})
              </button>
            )}
            {counts.orphaned > 0 && (
              <button className="btn btn-sm btn-danger" disabled={actionLoading !== null}
                onClick={() => doAction('/api/admin/monitoring/cleanup/orphans', 'cleanup orphaned containers')}>
                Cleanup Orphans ({counts.orphaned})
              </button>
            )}
          </div>
        </div>
        <div className="mn-summary">
          <span className="mn-badge mn-badge-normal">{counts.normal} normal</span>
          {counts.stale > 0 && <span className="mn-badge mn-badge-stale">{counts.stale} stale</span>}
          {counts.orphaned > 0 && <span className="mn-badge mn-badge-orphaned">{counts.orphaned} orphaned</span>}
          {counts.leftover > 0 && <span className="mn-badge mn-badge-leftover">{counts.leftover} leftover</span>}
        </div>

        {containers.length === 0 ? (
          <p className="mn-empty">No managed containers found.</p>
        ) : (
          <div className="mn-table-wrap">
            <table className="mn-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Flag</th>
                  <th>CPU</th>
                  <th>Memory</th>
                  <th>Uptime</th>
                  <th>Image</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {containers.map((c) => (
                  <tr key={c.id}>
                    <td className="mn-name-cell">
                      <span className="mn-name">
                        {c.siteId || c.name}
                        {c.labels['wp-launcher.role'] && <span className="mn-role-tag">{c.labels['wp-launcher.role']}</span>}
                      </span>
                      <span className="mn-id">{c.id}</span>
                    </td>
                    <td><span className={`badge badge-${c.state === 'running' ? 'running' : 'expired'}`}>{c.state}</span></td>
                    <td><span className={`mn-badge mn-badge-${c.flag}`}>{c.flag}</span></td>
                    <td>{c.cpuPercent !== null ? `${c.cpuPercent}%` : '—'}</td>
                    <td>{c.memUsage !== null ? `${formatBytes(c.memUsage)} / ${formatBytes(c.memLimit || 0)}` : '—'}</td>
                    <td>{formatUptime(c.created)}</td>
                    <td className="mn-image-cell">{c.image.split(':')[0].split('/').pop()}</td>
                    <td>
                      <button className="btn btn-xs btn-danger" disabled={actionLoading === c.idFull}
                        onClick={() => forceRemove(c.idFull, c.siteId || c.name)}>
                        {actionLoading === c.idFull ? '...' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disk Usage + Quick Actions */}
      <div className="mn-bottom-grid">
        {/* Docker Disk */}
        <div className="card">
          <h3 className="mn-section-title">Docker Disk Usage</h3>
          {disk && (
            <div className="mn-disk-list">
              <div className="mn-disk-item">
                <span className="mn-disk-label">Images ({disk.images.count})</span>
                <span className="mn-disk-value">{formatBytes(disk.images.totalSize)}</span>
              </div>
              <div className="mn-disk-item">
                <span className="mn-disk-label">Volumes ({disk.volumes.count})</span>
              </div>
              {disk.images.items.length > 0 && (
                <details className="mn-details">
                  <summary>Image details</summary>
                  <div className="mn-image-list">
                    {disk.images.items.map((img, i) => (
                      <div key={i} className="mn-disk-item mn-disk-item-sub">
                        <span className="mn-disk-label">{img.repoTags?.[0] || img.id}</span>
                        <span className="mn-disk-value">{formatBytes(img.size)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="mn-section-title">Quick Actions</h3>
          <div className="mn-actions-list">
            <button className="btn btn-secondary mn-action-btn" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/images', 'prune unused images')}>
              {actionLoading === 'prune unused images' ? <span className="spinner spinner-dark" /> : null}
              Prune Images
            </button>
            <button className="btn btn-secondary mn-action-btn" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/volumes', 'prune unused volumes')}>
              {actionLoading === 'prune unused volumes' ? <span className="spinner spinner-dark" /> : null}
              Prune Volumes
            </button>
            <button className="btn btn-secondary mn-action-btn" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/buildcache', 'prune build cache')}>
              {actionLoading === 'prune build cache' ? <span className="spinner spinner-dark" /> : null}
              Prune Build Cache
            </button>
            <button className="btn btn-secondary mn-action-btn" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/cleanup/orphans', 'cleanup orphaned containers')}>
              {actionLoading === 'cleanup orphaned containers' ? <span className="spinner spinner-dark" /> : null}
              Cleanup Orphans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
