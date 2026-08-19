import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { useSettingsStore } from '../../stores/SettingsStore';

// Guards navigation away from the settings hub while any panel has unsaved
// changes. Requires the data router (createBrowserRouter) — the app was
// migrated in App.jsx so useBlocker can intercept in-app navigation. The
// beforeunload listener covers closing/reloading the tab.
export default function UnsavedPrompt() {
  const { dirty } = useSettingsStore();

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!blocker || blocker.state !== 'blocked') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold mb-1">Unsaved changes</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          You have unsaved changes. Leave without saving?
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => blocker.reset()} className="btn btn-ghost">Stay</button>
          <button onClick={() => blocker.proceed()} className="btn btn-danger">Discard &amp; leave</button>
        </div>
      </div>
    </div>
  );
}