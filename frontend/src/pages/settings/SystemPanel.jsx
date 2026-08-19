import { useSearchParams } from 'react-router-dom';
import ProfileBehaviourTab from './system/ProfileBehaviourTab';
import LabelsLegalTab from './system/LabelsLegalTab';
import EmailWebhooksTab from './system/EmailWebhooksTab';
import ApiKeysTab from './system/ApiKeysTab';
import TelemetryTab from './system/TelemetryTab';
import HealthTab from './system/HealthTab';
import DataTab from './system/DataTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'labels', label: 'Labels & Legal' },
  { id: 'email', label: 'Email & Webhooks' },
  { id: 'api', label: 'Environment & API Keys' },
  { id: 'telemetry', label: 'Audit & Telemetry' },
  { id: 'health', label: 'System Health' },
  { id: 'data', label: 'Data & Backups' }
];

export default function SystemPanel() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const setTab = (id) => setParams(id === 'overview' ? {} : { tab: id }, { replace: true });

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id
              ? 'border-lux-500 text-lux-600 dark:text-lux-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <ProfileBehaviourTab />}
      {tab === 'labels' && <LabelsLegalTab />}
      {tab === 'email' && <EmailWebhooksTab />}
      {tab === 'api' && <ApiKeysTab />}
      {tab === 'telemetry' && <TelemetryTab />}
      {tab === 'health' && <HealthTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}