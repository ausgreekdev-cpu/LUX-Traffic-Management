import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api.js';
import { useAppText } from '../context/AppText.jsx';
import { useBranding } from '../context/Branding.jsx';
import { useSettingsStore } from '../stores/SettingsStore';
import { permissionAllowed } from '../utils/permissions';

const mainNav = [
  { to: '/', label: 'Dashboard', icon: '📊', permission: 'dashboard' },
  { to: '/field', label: 'Field Mode', icon: '📱', permission: 'field' },
  { to: '/tmps', label: 'TMPs', icon: '📋', permission: 'view_tmps' },
  { to: '/kanban', label: 'Kanban', icon: '🗂️', permission: 'view_kanban' },
  { to: '/projects', label: 'Projects', icon: '📁', permission: 'view_projects' },
  { to: '/permits', label: 'Permits', icon: '📄', permission: 'view_permits' },
  { to: '/authorities', label: 'Authorities', icon: '🏛️', permission: 'view_authorities' },
  { to: '/time-tracking', label: 'Time Tracking', icon: '⏱️', permission: 'time_tracking' },
  { to: '/correspondence', label: 'Correspondence', icon: '📨', permission: 'manage_correspondence' },
  { to: '/analytics', label: 'Analytics', icon: '📈', permission: 'view_analytics' },
  { to: '/clients', label: 'Clients', icon: '👥', permission: 'view_clients' },
  { to: '/sites', label: 'Sites', icon: '📍', permission: 'view_sites' },
  { to: '/settings', label: 'Settings', icon: '⚙️', permission: 'access_settings' },
  { to: '/help', label: 'Help & FAQ', icon: '📖', permission: 'help' }
];

function navVisible(item, role, matrix) {
  if (item.permission === 'help' || item.to === '/') return true;
  return permissionAllowed(role, item.permission, matrix);
}

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

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
}

export default function Layout({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { nav, appName } = useAppText();
  const { branding } = useBranding();
  const { groups } = useSettingsStore();
  const matrix = groups?.rbac?.matrix;
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

  const renderNavItem = (item) => {
    const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
    const label = nav(item.to, item.label);
    return (
      <Link key={item.to} to={item.to} title={sidebarOpen ? undefined : label}
        className={`relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all ${active
          ? 'bg-lux-500 text-white shadow-md shadow-lux-500/20'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'} ${sidebarOpen ? 'px-3 py-2.5' : 'justify-center px-0 py-2.5'}`}>
        {active && sidebarOpen && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white" />}
        <span className="text-base leading-none shrink-0">{item.icon}</span>
        {sidebarOpen && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <div className="flex h-screen">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gradient-to-b from-gray-900 to-gray-950 text-white flex flex-col transition-all duration-200 border-r border-gray-800 shrink-0`}>
        <div className="h-16 flex items-center justify-between px-4 gap-2 shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar"
            className={`flex items-center min-w-0 rounded-lg transition-colors ${sidebarOpen ? 'hover:bg-gray-800 px-1 py-1' : 'w-full justify-center hover:bg-gray-800 py-1.5'}`}>
            <div className="flex items-center min-w-0 shrink-0">
              {branding?.assets?.logoLight ? (
                <img src={branding.assets.logoLight} alt="logo" className="h-9 w-auto max-w-40 object-contain rounded" />
              ) : (
                <div className="h-9 w-9 rounded-lg bg-lux-500 flex items-center justify-center shadow-lg shadow-lux-500/25 shrink-0">
                  <span className="font-black text-gray-900 text-sm tracking-tight">LUX</span>
                </div>
              )}
            </div>
            {sidebarOpen && (
              <div className="min-w-0 ml-2.5 text-left">
                <p className="font-bold text-sm leading-tight truncate">{appName('LUX Traffic')}</p>
                <p className="text-[10px] text-gray-400 leading-tight">Management</p>
              </div>
            )}
          </button>
          {sidebarOpen && (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Collapse sidebar" className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors shrink-0">
              ◀
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {mainNav.filter(item => navVisible(item, user?.role, matrix)).map(renderNavItem)}
        </nav>
        {user && (
          <div className="shrink-0 p-3 border-t border-gray-800">
            {sidebarOpen ? (
              <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-800 transition-colors">
                <div className="h-8 w-8 rounded-full bg-lux-500/90 text-gray-900 flex items-center justify-center font-bold text-xs shrink-0">
                  {initials(user.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className={`text-xs ${user.role === 'client' ? 'text-lux-400' : 'text-gray-500'} capitalize`}>{user.role}</p>
                </div>
                <button onClick={onLogout} title="Logout" className="text-xs text-red-400 hover:text-red-300 shrink-0">Logout</button>
              </div>
            ) : (
              <button onClick={onLogout} title="Logout" className="w-full flex justify-center text-red-400 hover:text-red-300 rounded-lg hover:bg-gray-800 py-1.5 transition-colors">
                🚪
              </button>
            )}
          </div>
        )}
      </aside>
      <main className="flex-1 min-w-0 overflow-auto bg-gray-50 dark:bg-gray-900 p-6">
        <div className="flex justify-end mb-4 relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className="relative p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Notifications">
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center shadow-sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-12 w-96 max-w-[calc(100vw-3rem)] bg-white dark:bg-gray-800 rounded-xl shadow-xl shadow-black/10 ring-1 ring-black/5 border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                <h3 className="font-semibold text-sm">Notifications</h3>
                <div className="flex gap-2">
                  {unreadCount > 0 && (
                    <button onClick={() => { api.notifications.markAllRead().then(() => { setUnreadCount(0); setNotifications(notifications.map(n => ({ ...n, is_read: 1 }))); }); }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Mark all read</button>
                  )}
                  <button onClick={() => { api.notifications.scan().then(() => refreshNotifications(true)).catch(() => {}); }}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Refresh</button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                {loadingBell ? (
                  <p className="p-4 text-sm text-gray-500">Loading…</p>
                ) : notifications.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">No notifications yet.</p>
                ) : notifications.map(n => (
                  <button key={n.id} onClick={() => openNotification(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${n.is_read ? 'opacity-60' : ''}`}>
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
