import { useEffect, useState } from 'react';
import api from '../../../api';
import SectionCard from '../../../components/settings/SectionCard';

function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default function HealthTab() {
  const [health, setHealth] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
  }, [refreshKey]);

  const up = Math.floor((health?.uptime_seconds || 0) / 3600);
  const upMin = Math.floor(((health?.uptime_seconds || 0) % 3600) / 60);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Server status, database integrity and resource usage.</p>
        <button onClick={() => setRefreshKey(k => k + 1)} className="btn btn-ghost text-sm">Refresh</button>
      </div>

      <SectionCard title="Status" description="Public health endpoint: /api/health">
        {health ? (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${health.status === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
              {health.status === 'ok' ? '● Healthy' : '● Degraded'}
            </span>
            <span className="text-gray-500 dark:text-gray-400">Uptime: {up}h {upMin}m</span>
            <span className="text-gray-500 dark:text-gray-400">Schema: v{health.schema_version}</span>
            <span className="text-gray-500 dark:text-gray-400">{health.serverless ? 'Serverless runtime' : 'Self-hosted runtime'}</span>
          </div>
        ) : <p className="text-sm text-gray-500">Loading…</p>}
      </SectionCard>

      <SectionCard title="Database" description="Integrity and size of the SQLite store.">
        {health?.db ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Integrity check</p>
              <p className={`font-semibold ${health.db.integrity === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{health.db.integrity}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Size</p>
              <p className="font-semibold">{fmtBytes(health.db.size_bytes)}</p>
              <p className="text-xs text-gray-400 truncate" title={health.db.path}>{health.db.path}</p>
            </div>
          </div>
        ) : <p className="text-sm text-gray-500">Loading…</p>}
      </SectionCard>

      <SectionCard title="Storage" description="Media and asset counts.">
        {health?.storage ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Media</p>
              <p className="font-semibold">{fmtBytes(health.storage.media_bytes)}</p>
              <p className="text-xs text-gray-400">{health.storage.media_files} files</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Photos</p>
              <p className="font-semibold">{health.storage.photos}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Branding assets</p>
              <p className="font-semibold">{health.storage.branding_assets}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Last backup</p>
              <p className="font-semibold text-xs truncate">{health.backups?.last ? String(health.backups.last).slice(0, 19).replace('T', ' ') : 'never'}</p>
            </div>
          </div>
        ) : <p className="text-sm text-gray-500">Loading…</p>}
      </SectionCard>
    </div>
  );
}