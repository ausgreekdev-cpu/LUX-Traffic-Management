import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

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
  { to: '/users', label: 'Users', icon: '🔐', admin: true }
];

export default function Layout({ user, onLogout }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        <Outlet />
      </main>
    </div>
  );
}
