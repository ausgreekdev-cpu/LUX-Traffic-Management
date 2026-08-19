import { useEffect, useState } from 'react';
import api from '../../../api';
import SectionCard from '../../../components/settings/SectionCard';

function StatPills({ stats }) {
  if (!stats || !stats.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {stats.map((s) => (
        <span key={s.status} className={`px-2 py-0.5 rounded text-xs font-medium ${s.status === 'fired' || s.status === 'sent' || s.status === 'received' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : s.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
          {s.status}: {s.count}
        </span>
      ))}
    </div>
  );
}

function LogRows({ rows, columns }) {
  if (!rows || !rows.length) return <p className="text-xs text-gray-400">No activity recorded yet.</p>;
  return (
    <div className="text-xs space-y-1 max-h-64 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded p-2">
      {rows.map((r, i) => (
        <p key={r.id || i} className="truncate font-mono">
          <span className="text-gray-400">{String(r.created_at || '').slice(0, 19).replace('T', ' ')}</span>
          {columns.map((c) => (
            <span key={c} className="ml-2">
              {r[c] !== null && r[c] !== undefined ? String(r[c]) : ''}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default function TelemetryTab() {
  const [webhooks, setWebhooks] = useState(null);
  const [automations, setAutomations] = useState(null);
  const [emails, setEmails] = useState(null);
  const [storage, setStorage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.telemetry.webhooks({ limit: 50 }).then(setWebhooks).catch(() => {});
    api.telemetry.automations({ limit: 50 }).then(setAutomations).catch(() => {});
    api.telemetry.emails({ limit: 50 }).then(setEmails).catch(() => {});
    api.telemetry.storage().then(setStorage).catch(() => {});
  }, [refreshKey]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Operational activity across the platform — last 50 events per stream.</p>
        <button onClick={() => setRefreshKey(k => k + 1)} className="btn btn-ghost text-sm">Refresh</button>
      </div>

      <SectionCard title="Storage" description="Database and media usage on the server.">
        {storage ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Database</p>
              <p className="font-semibold">{fmtBytes(storage.database?.bytes)}</p>
              <p className="text-xs text-gray-400 truncate" title={storage.database?.path}>{storage.database?.path}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Media files</p>
              <p className="font-semibold">{fmtBytes(storage.media?.bytes)}</p>
              <p className="text-xs text-gray-400">{storage.media?.files} files</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Photos</p>
              <p className="font-semibold">{storage.photos?.count}</p>
              <p className="text-xs text-gray-400">site photos</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Branding assets</p>
              <p className="font-semibold">{storage.branding_assets?.count}</p>
              <p className="text-xs text-gray-400">files</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Backups</p>
              <p className="font-semibold">{storage.backups?.count}</p>
              <p className="text-xs text-gray-400">on disk</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-400">Schema</p>
              <p className="font-semibold">v{storage.schema_version}</p>
              <p className="text-xs text-gray-400">{storage.serverless ? 'serverless' : 'self-hosted'}</p>
            </div>
          </div>
        ) : <p className="text-sm text-gray-500">Loading…</p>}
      </SectionCard>

      <SectionCard title="Inbound webhook deliveries" description="Correspondence received from email/webhook providers and whether it was matched.">
        <StatPills stats={webhooks?.stats} />
        <LogRows rows={webhooks?.data} columns={['provider', 'status', 'tmp_reference']} />
      </SectionCard>

      <SectionCard title="Automation runs" description="Automation rule evaluations and actions.">
        <StatPills stats={automations?.stats} />
        <LogRows rows={automations?.data} columns={['rule_name', 'event_type', 'status']} />
      </SectionCard>

      <SectionCard title="Outbound email log" description="Recent emails sent by the system.">
        <StatPills stats={emails?.stats} />
        <LogRows rows={emails?.data} columns={['to_address', 'subject', 'status']} />
      </SectionCard>
    </div>
  );
}