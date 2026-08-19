import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { isOnline, onNetworkChange } from '../../lib/mobileCaps';
import { getQueue, removeFromQueue, cacheGet } from '../../lib/fieldStore';

async function flushUploads(setStatus) {
  const queue = await getQueue();
  for (const item of queue) {
    try {
      const form = new FormData();
      form.append('file', item.blob, 'site.jpg');
      form.append('meta', JSON.stringify(item.meta));
      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: form
      });
      if (!res.ok) continue;
      await removeFromQueue(item.id);
    } catch {
      // keep in queue, retry next time
    }
  }
  const q = await getQueue();
  setStatus({ pending: q.length });
}

export default function FieldLayout({ user }) {
  const location = useLocation();
  const [online, setOnline] = useState(isOnline());
  const [queue, setQueue] = useState(null);

  const refreshQueue = async () => {
    const rows = await getQueue();
    setQueue(rows.length);
  };

  useEffect(() => {
      refreshQueue();
      const off = onNetworkChange(async (connected) => {
        setOnline(connected);
        if (connected) {
          await flushUploads(setQueue);
          refreshQueue();
        }
      });
      return off;
    }, []);

  const tabs = [
    { to: '/field', label: 'Plans', icon: '📋' },
    { to: '/field/board', label: 'Board', icon: '🗂️' },
    { to: '/field/permits', label: 'Permits', icon: '📄' }
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col max-w-md mx-auto shadow-2xl">
      <header className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">Field mode</p>
          <p className="text-xs text-gray-500 truncate capitalize">{user?.name} · {user?.role}</p>
        </div>
        <div className="flex items-center gap-2">
          {queue != null && queue > 0 && (
            <Link to="/field" className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
              📤 {queue} queued
            </Link>
          )}
          {!online && (
            <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium">Offline</span>
          )}
          <Link to="/" className="text-xs text-lux-600 dark:text-lux-400 hover:underline">Exit</Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 grid grid-cols-3 z-20">
        {tabs.map((t) => {
          const active = t.to === '/field' ? location.pathname === '/field' : location.pathname.startsWith(t.to);
          return (
            <Link key={t.to} to={t.to} className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${active ? 'text-lux-600 dark:text-lux-400' : 'text-gray-500 dark:text-gray-400'}`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export { flushUploads, getQueue, cacheGet };