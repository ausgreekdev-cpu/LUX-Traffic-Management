import { useSearchParams } from 'react-router-dom';
import KanbanRulesTab from './traffic/KanbanRulesTab';
import WorkflowSettings from '../WorkflowSettings';
import AutomationSettings from '../AutomationSettings';
import ExportStandardsTab from './traffic/ExportStandardsTab';

const TABS = [
  { id: 'kanban', label: 'Kanban Rules' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'automations', label: 'Automation' },
  { id: 'export', label: 'Export Standards' }
];

export default function TrafficEnginePanel() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'kanban';
  const setTab = (id) => setParams(id === 'kanban' ? {} : { tab: id }, { replace: true });

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
      {tab === 'kanban' && <KanbanRulesTab />}
      {tab === 'workflows' && <WorkflowSettings />}
      {tab === 'automations' && <AutomationSettings />}
      {tab === 'export' && <ExportStandardsTab />}
    </div>
  );
}