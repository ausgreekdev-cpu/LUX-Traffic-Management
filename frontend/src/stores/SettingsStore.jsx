import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';

// Reactive settings store: holds the namespaced settings groups (api keys,
// RBAC matrix, SSO, export standards, kanban rules) and a per-panel dirty
// registry so the unsaved-changes prompt can guard navigation app-wide.
const SettingsStoreContext = createContext(null);

export function SettingsStoreProvider({ children }) {
  const [groups, setGroups] = useState(null);
  const [groupsError, setGroupsError] = useState('');
  const [dirty, setDirtyState] = useState({});

  const refreshGroups = useCallback(() => {
    // Settings groups are developer-only and the whole /api/settings router is
    // authenticated, so there is nothing to fetch while logged out.
    if (!localStorage.getItem('token')) {
      setGroups(null);
      setGroupsError('');
      return Promise.resolve(null);
    }
    setGroupsError('');
    return api.settings.groups()
      .then((g) => { setGroups(g); return g; })
      .catch((e) => { setGroups(null); setGroupsError(e.status === 403 ? 'You do not have permission to load settings (requires Developer).' : e.message || 'Failed to load settings.'); return null; });
  }, []);

  useEffect(() => { refreshGroups(); }, [refreshGroups]);

  const setDirty = useCallback((id, value) => {
    setDirtyState((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  const value = useMemo(() => ({
    groups,
    groupsError,
    refreshGroups,
    dirty: Object.values(dirty).some(Boolean),
    setDirty
  }), [groups, groupsError, dirty, refreshGroups, setDirty]);

  return (
    <SettingsStoreContext.Provider value={value}>
      {children}
    </SettingsStoreContext.Provider>
  );
}

export function useSettingsStore() {
  return useContext(SettingsStoreContext);
}