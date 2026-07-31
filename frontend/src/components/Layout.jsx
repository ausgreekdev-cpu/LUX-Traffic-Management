import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api.js';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/tmps', label: 'TMPs', icon: '📋' },
  { to: '/projects', label: 'Projects', icon: '📁' },
  { to: '/permits', label: 'Permits', icon: '📄' },
  { to: '/authorities', label: 'Authorities', icon: '🏛️' },
  { to: '/time-tracking', label: 'Time Tracking', icon: '⏱️' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/clients', label: 'Clients', icon: '👥' },
  { to: '/sites', label: 'Sites', icon: '📍' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
  { to: '/help', label: 'Help & FAQ', icon: '📖' },
  { to: '/workflows', label: 'Workflows', icon: '🔄', admin: true },
  { to: '/users', label: 'Users', icon: '🔐', admin: true }
];

const typeIcons = {
  tmp_expiring: '⏳',
  tmp_expired: '🚫',
  permit_expiring: '📅',
  permit_expired: '🚫',
  default: '🔔'
};

function timeAgo(dateStr) {
  const then = new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Layout({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [loadingBell, setLoadingBell] = useState(false);
  const bellRef = useRef(null);

  const refreshNotifications = async (showLoading) => {
    try {
      if (showLoading) setLoadingBell(true);
      const [count, list] = await Promise.all([
        api.notifications.unreadCount(),
        api.notifications.list({ limit: 20 })
      ]);
      setUnreadCount(count.count);
      setNotifications(list.data);
    } catch {
      // ignore
    } finally {
      if (showLoading) setLoadingBell(false);
    }
  };

  useEffect(() => {
    api.notifications.scan().catch(() => {});
    refreshNotifications(false);
    const interval = setInterval(() => {
      api.notifications.unreadCount().then(({ count }) => setUnreadCount(count)).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bellOpen && !location.pathname.startsWith('/settings')) {
      refreshNotifications(true);
    }
  }, [bellOpen, location.pathname]);

  useEffect(() => {
    const onClick = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openNotification = async (n) => {
    setBellOpen(false);
    if (!n.is_read) {
      api.notifications.markRead(n.id).catch(() => {});
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.entity_type === 'tmp') navigate(`/tmps/${n.entity_id}`);
    else if (n.entity_type === 'permit') navigate(`/permits/${n.entity_id}`);
  };

  return (
    <div className="flex h-screen">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 text-white flex flex-col transition-all duration-200`}>
        <div className="p-4 flex items-center justify-between">
          {sidebarOpen && <h1 className="text-lg font-bold text-amber-400">LUX Traffic</h1>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white p-1">
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        <nav className="flex-1 mt-4">
          {navItems.filter(i => !i.admin || user?.role === 'admin').map(item => (
            <Link key={item.to} to={item.to}
              className={`flex items-center px-4 py-3 text-sm transition-colors ${location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to)) ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}>
              <span className="mr-3">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        {user && (
          <div className="p-4 border-t border-gray-700">
            {sidebarOpen ? (
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-gray-400">{user.role}</p>
                <button onClick={onLogout} className="mt-2 text-xs text-red-400 hover:text-red-300">Logout</button>
              </div>
            ) : (
              <button onClick={onLogout} className="text-red-400 hover:text-red-300">🚪</button>
            )}
          </div>
        )}
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-6">
        <div className="flex justify-end mb-4 relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className="relative p-2 rounded-lg bg-white dark:bg-gray-800 shadow text-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Notifications">
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-12 w-96 max-w-[calc(100vw-3rem)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold">Notifications</h3>
                <div className="flex gap-2">
                  {unreadCount > 0 && (
                    <button onClick={() => { api.notifications.markAllRead().then(() => { setUnreadCount(0); setNotifications(notifications.map(n => ({ ...n, is_read: 1 }))); }); }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Mark all read</button>
                  )}
                  <button onClick={() => { api.notifications.scan().then(() => refreshNotifications(true)).catch(() => {}); }}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Refresh</button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {loadingBell ? (
                  <p className="p-4 text-sm text-gray-500">Loading…</p>
                ) : notifications.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">No notifications yet.</p>
                ) : notifications.map(n => (
                  <button key={n.id} onClick={() => openNotification(n)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${n.is_read ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{typeIcons[n.type] || typeIcons.default}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        {n.message && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{n.message}</p>}
                        <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
