import { NavLink, Outlet } from 'react-router-dom';
import UnsavedPrompt from './UnsavedPrompt';

const CATEGORIES = [
  {
    to: '/settings/system',
    icon: '🖥️',
    title: 'General & System',
    blurb: 'Diagnostics, API keys, telemetry, health',
    sections: [
      { to: '/settings/system', label: 'Overview' },
      { to: '/settings/system?tab=api', label: 'API Keys' },
      { to: '/settings/system?tab=telemetry', label: 'Telemetry' },
      { to: '/settings/system?tab=health', label: 'Health' }
    ]
  },
  {
    to: '/settings/branding',
    icon: '🎨',
    title: 'Branding & White-Labeling',
    blurb: 'Theme, assets, PDF stamping, email, domains',
    sections: [
      { to: '/settings/branding', label: 'Brand scope' },
      { to: '/settings/branding?tab=assets', label: 'Assets & Fonts' },
      { to: '/settings/branding?tab=pdf', label: 'PDF Stamping' },
      { to: '/settings/branding?tab=email', label: 'Email & Domain' }
    ]
  },
  {
    to: '/settings/traffic',
    icon: '🚦',
    title: 'Traffic Engine',
    blurb: 'Kanban rules, workflows, automation, export standards',
    sections: [
      { to: '/settings/traffic', label: 'Kanban Rules' },
      { to: '/settings/traffic?tab=workflows', label: 'Workflows' },
      { to: '/settings/traffic?tab=automations', label: 'Automation' },
      { to: '/settings/traffic?tab=export', label: 'Export Standards' }
    ]
  },
  {
    to: '/settings/security',
    icon: '🔐',
    title: 'Access & Security',
    blurb: 'Users, RBAC matrix, single sign-on',
    sections: [
      { to: '/settings/security', label: 'Users' },
      { to: '/settings/security?tab=rbac', label: 'RBAC Matrix' },
      { to: '/settings/security?tab=sso', label: 'Single Sign-On' }
    ]
  }
];

const linkCls = ({ isActive }) =>
  `flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
    isActive
      ? 'bg-lux-50 text-lux-700 dark:bg-lux-900/40 dark:text-lux-300 font-medium'
      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
  }`;

export default function SettingsLayout() {
  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="page-header">Settings</h1>
        <p className="page-sub">Developer, white-label and traffic-engine configuration</p>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-64 shrink-0">
          <nav className="space-y-3">
            {CATEGORIES.map((cat) => (
              <div key={cat.to} className="rounded-xl border border-gray-200 dark:border-gray-700 p-2">
                <NavLink to={cat.to} end className={linkCls}>
                  <span>{cat.icon}</span>
                  <span>
                    <span className="block font-semibold leading-tight">{cat.title}</span>
                    <span className="block text-[11px] font-normal text-gray-400 dark:text-gray-500">{cat.blurb}</span>
                  </span>
                </NavLink>
                <div className="mt-1 pl-3 space-y-0.5">
                  {cat.sections.map((s) => (
                    <NavLink key={s.to} to={s.to} end={s.to === cat.to} className={linkCls}>
                      <span className="inline-block w-4" />
                      <span>{s.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <section className="flex-1 min-w-0">
          <Outlet />
        </section>
      </div>
      <UnsavedPrompt />
    </div>
  );
}