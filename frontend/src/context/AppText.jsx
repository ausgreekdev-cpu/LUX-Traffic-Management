import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AppTextContext = createContext({});

const DEFAULT_STATUS = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', approved: 'Approved',
  rejected: 'Rejected', expired: 'Expired', cancelled: 'Cancelled', completed: 'Completed'
};

const DEFAULT_COMPLEXITY = {
  simple: 'Simple', standard: 'Standard', complex: 'Complex', complex_with_notice: 'Complex + notice'
};

function parseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

export function AppTextProvider({ children }) {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) { setSettings({}); return; }
    api.settings.get()
      .then(setSettings)
      .catch(() => setSettings({}));
  }, []);

  const nav = (route, fallback) => {
    const map = parseJson(settings?.nav_labels_json, {});
    return map[route] || fallback;
  };

  const pageTitle = (key, fallback) => {
    const map = parseJson(settings?.page_titles_json, {});
    return map[key] || fallback;
  };

  const section = (key, fallback) => {
    const map = parseJson(settings?.sections_json, {});
    return map[key] || fallback;
  };

  const column = (page, key, fallback) => {
    const map = parseJson(settings?.columns_json, {});
    return map[page]?.[key] || fallback;
  };

  const status = (s) => {
    const map = parseJson(settings?.status_labels_json, {});
    return map[s] || DEFAULT_STATUS[s] || String(s || '').replace(/_/g, ' ');
  };

  const complexity = (c) => {
    const map = parseJson(settings?.complexity_labels_json, {});
    return map[c] || DEFAULT_COMPLEXITY[c] || c;
  };

  const appName = (fallback) => settings?.app_name || fallback;

  return (
    <AppTextContext.Provider value={{
      ready: !!settings,
      settings: settings || {},
      nav, pageTitle, section, column, status, complexity, appName
    }}>
      {children}
    </AppTextContext.Provider>
  );
}

export function useAppText() {
  return useContext(AppTextContext);
}
