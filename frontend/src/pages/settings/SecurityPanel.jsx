import { useSearchParams } from 'react-router-dom';
import UsersList from '../UsersList';
import RbacMatrixTab from './security/RbacMatrixTab';
import SsoTab from './security/SsoTab';

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'rbac', label: 'RBAC Matrix' },
  { id: 'sso', label: 'Single Sign-On' }
];

export default function SecurityPanel() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'users';
  const setTab = (id) => setParams(id === 'users' ? {} : { tab: id }, { replace: true });

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
      {tab === 'users' && <UsersList />}
      {tab === 'rbac' && <RbacMatrixTab />}
      {tab === 'sso' && <SsoTab />}
    </div>
  );
}