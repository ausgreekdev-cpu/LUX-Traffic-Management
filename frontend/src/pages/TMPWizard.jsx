import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

const WORK_TYPE_CARDS = [
  { key: 'general', label: 'General works', desc: 'Standard temporary road works with flexible options', icon: '📋', plan_type: 'temporary', complexity: 'standard' },
  { key: 'maintenance', label: 'Maintenance', desc: 'Short-duration pothole, patching, or minor repairs', icon: '🔧', plan_type: 'temporary', complexity: 'simple' },
  { key: 'event', label: 'Event', desc: 'Road closures & traffic management for public events', icon: '🎪', plan_type: 'event', complexity: 'complex' },
  { key: 'footpath_utility', label: 'Footpath / Utility', desc: 'Footpath openings, utility pits, trenching', icon: '🚧', plan_type: 'temporary', complexity: 'standard' },
  { key: 'skip_bin_hoarding', label: 'Skip Bin / Hoarding', desc: 'Skip bin placement, site hoarding, loading zones', icon: '🗑️', plan_type: 'temporary', complexity: 'standard' }
];

export default function TMPWizard() {
  const navigate = useNavigate();
  const [workTypes, setWorkTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tmps.workTypes().then(setWorkTypes).catch(() => {}).finally(() => setLoading(false));
  }, []);
  // workTypes loaded from API for future dynamic cards; using static for now
  void workTypes;

  const selectType = (wt) => {
    const base = wt.plan_type === 'event' ? 'event' : 'temporary';
    navigate(`/tmps/new?work_type=${wt.value}&plan_type=${base}&complexity=${wt.complexity}`);
  };

  if (loading) return <div className="max-w-2xl mx-auto p-6 text-center">Loading work types…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="page-header mb-2">Create New TMP</h1>
      <p className="text-gray-500 mb-6">Choose the type of work to pre-fill the plan with sensible defaults for that work type.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {WORK_TYPE_CARDS.map((wt) => (
          <button
            key={wt.key}
            onClick={() => selectType(wt)}
            className="card p-6 hover:border-lux-400 dark:hover:border-lux-500 transition border-2 border-gray-200 dark:border-gray-700 group"
          >
            <div className="text-4xl mb-2">{wt.icon}</div>
            <h3 className="font-semibold text-lg">{wt.label}</h3>
            <p className="text-sm text-gray-500 mt-1">{wt.desc}</p>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{wt.plan_type}</span>
              <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{wt.complexity}</span>
            </div>
            <div className="mt-3 text-lux-600 dark:text-lux-400 text-sm font-medium group-hover:underline">Start with this template →</div>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <Link to="/tmps/new/form" className="text-sm text-gray-500 hover:text-lux-600 dark:hover:text-lux-400">← Or start with a blank plan</Link>
      </div>
    </div>
  );
}