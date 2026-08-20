import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';

// Reactive settings store: holds the namespaced settings groups (api keys,
// RBAC matrix, SSO, export standards, kanban rules) and a per-panel dirty
// registry so the unsaved-changes prompt can guard navigation app-wide.
const SettingsStoreContext = createContext(null);

export function SettingsStoreProvider({ children }) {
  const [groups, setGroups] = useState(null);
  const [dirty, setDirtyState] = useState({});

  const refreshGroups = useCallback(() => {
    // Settings groups are developer-only and the whole /api/settings router is
    // authenticated, so there is nothing to fetch while logged out.
    if (!localStorage.getItem('token')) {
      setGroups(null);
      return Promise.resolve(null);
    }
    return api.settings.groups().then(setGroups).catch(() => setGroups(null));
  }, []);

  useEffect(() => { refreshGroups(); }, [refreshGroups]);

  const setDirty = useCallback((id, value) => {
    setDirtyState((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  const value = useMemo(() => ({
    groups,
    refreshGroups,
    dirty: Object.values(dirty).some(Boolean),
    setDirty
  }), [groups, dirty, refreshGroups, setDirty]);

  return (
    <SettingsStoreContext.Provider value={value}>
      {children}
    </SettingsStoreContext.Provider>
  );
}

export function useSettingsStore() {
  return useContext(SettingsStoreContext);
}