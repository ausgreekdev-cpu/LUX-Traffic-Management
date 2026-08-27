import { useState, useEffect, lazy, Suspense, useMemo } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import api, { apiUrl } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import ErrorBoundary from './components/ErrorBoundary';
import ChunkErrorElement from './components/ChunkErrorElement';
import { AppTextProvider } from './context/AppText';
import { AuthProvider, RANK } from './context/Auth';
import { SettingsStoreProvider } from './stores/SettingsStore';
import SettingsLayout from './components/settings/SettingsLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const TMPList = lazy(() => import('./pages/TMPList'));
const TMPDetail = lazy(() => import('./pages/TMPDetail'));
const TMPForm = lazy(() => import('./pages/TMPForm'));
const TMPWizard = lazy(() => import('./pages/TMPWizard'));
const ClientList = lazy(() => import('./pages/ClientList'));
const SiteList = lazy(() => import('./pages/SiteList'));
const ProjectList = lazy(() => import('./pages/ProjectList'));
const AuthorityList = lazy(() => import('./pages/AuthorityList'));
const PermitList = lazy(() => import('./pages/PermitList'));
const PermitDetail = lazy(() => import('./pages/PermitDetail'));
const PermitForm = lazy(() => import('./pages/PermitForm'));
const TimeTracking = lazy(() => import('./pages/TimeTracking'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Help = lazy(() => import('./pages/Help'));
const Correspondence = lazy(() => import('./pages/Correspondence'));
const Kanban = lazy(() => import('./pages/Kanban'));
const FieldLayout = lazy(() => import('./pages/field/FieldLayout'));
const FieldHome = lazy(() => import('./pages/field/FieldHome'));
const FieldTmpDetail = lazy(() => import('./pages/field/FieldTmpDetail'));
const FieldBoard = lazy(() => import('./pages/field/FieldBoard'));
const FieldPermits = lazy(() => import('./pages/field/FieldPermits'));
const FieldPermitDetail = lazy(() => import('./pages/field/FieldPermitDetail'));
const Billing = lazy(() => import('./pages/Billing'));
const AdminOverride = lazy(() => import('./pages/AdminOverride'));
const GisGenerator = lazy(() => import('./pages/GisGenerator'));

// Settings hub panels
const SystemPanel = lazy(() => import('./pages/settings/SystemPanel'));
const BrandingPanel = lazy(() => import('./pages/settings/BrandingPanel'));
const TrafficEnginePanel = lazy(() => import('./pages/settings/TrafficEnginePanel'));
const SecurityPanel = lazy(() => import('./pages/settings/SecurityPanel'));

function PageLoader() {
  return <div className="min-h-[50vh] flex items-center justify-center text-gray-500">Loading…</div>;
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ user, minRole, children }) {
  if (!user) return <Navigate to="/login" replace />;
  if ((RANK[user.role] || 0) < (RANK[minRole] || 0)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setAuthLoading(false);
      return;
    }
    api.auth.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem('token'); })
      .finally(() => setAuthLoading(false));
  }, []);

  // Keep the Netlify function instance warm while the app is open, so
  // navigation doesn't pay a cold-start penalty on every request.
  useEffect(() => {
    let stopped = false;
    let handle;
    const ping = async () => {
      try {
        await fetch(apiUrl('/ping'), { cache: 'no-store' });
      } catch {}
    };
    ping();
    handle = setInterval(() => {
      if (stopped || document.hidden) return;
      ping();
    }, 60000);
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  }, []);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const router = useMemo(() => createBrowserRouter([
    {
      path: '/login',
      element: user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />,
      errorElement: <ChunkErrorElement />
    },
    {
      path: '/',
      element: <ProtectedRoute><Layout user={user} onLogout={handleLogout} /></ProtectedRoute>,
      errorElement: <ChunkErrorElement />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'tmps', element: <TMPList /> },
        { path: 'kanban', element: <Kanban /> },
        { path: 'tmps/new', element: <RoleRoute user={user} minRole="staff"><TMPWizard /></RoleRoute> },
        { path: 'tmps/new/form', element: <RoleRoute user={user} minRole="staff"><TMPForm /></RoleRoute> },
        { path: 'tmps/:id', element: <TMPDetail /> },
        { path: 'tmps/:id/edit', element: <RoleRoute user={user} minRole="staff"><TMPForm /></RoleRoute> },
        { path: 'projects', element: <ProjectList /> },
        { path: 'clients', element: <ClientList /> },
        { path: 'sites', element: <RoleRoute user={user} minRole="staff"><SiteList /></RoleRoute> },
        { path: 'authorities', element: <AuthorityList /> },
        { path: 'permits', element: <PermitList /> },
        { path: 'permits/new', element: <RoleRoute user={user} minRole="staff"><PermitForm /></RoleRoute> },
        { path: 'permits/:id', element: <PermitDetail /> },
        { path: 'permits/:id/edit', element: <RoleRoute user={user} minRole="staff"><PermitForm /></RoleRoute> },
        { path: 'time-tracking', element: <RoleRoute user={user} minRole="staff"><TimeTracking /></RoleRoute> },
        { path: 'analytics', element: <RoleRoute user={user} minRole="staff"><Analytics /></RoleRoute> },
        { path: 'help', element: <Help /> },
        { path: 'billing', element: <Billing /> },
        { path: 'gis', element: <RoleRoute user={user} minRole="staff"><GisGenerator /></RoleRoute> },
        { path: 'admin/override', element: <RoleRoute user={user} minRole="developer"><AdminOverride /></RoleRoute> },
        { path: 'correspondence', element: <RoleRoute user={user} minRole="manager"><Correspondence /></RoleRoute> },
        {
          path: 'settings',
          element: <RoleRoute user={user} minRole="developer"><SettingsLayout /></RoleRoute>,
          children: [
            { index: true, element: <Navigate to="system" replace /> },
            { path: 'system', element: <SystemPanel /> },
            { path: 'branding', element: <BrandingPanel /> },
            { path: 'traffic', element: <TrafficEnginePanel /> },
            { path: 'security', element: <SecurityPanel /> }
          ]
        }
      ]
    },
    {
      path: '/field',
      element: <ProtectedRoute><FieldLayout user={user} onLogout={handleLogout} /></ProtectedRoute>,
      errorElement: <ChunkErrorElement />,
      children: [
        { index: true, element: <FieldHome /> },
        { path: 'tmps/:id', element: <FieldTmpDetail /> },
        { path: 'board', element: <FieldBoard /> },
        { path: 'permits', element: <FieldPermits /> },
        { path: 'permits/:id', element: <FieldPermitDetail /> }
      ]
    },
    // Legacy settings-adjacent routes now live inside the /settings hub.
    { path: '/branding', element: <RoleRoute user={user} minRole="developer"><Navigate to="/settings/branding" replace /></RoleRoute> },
    { path: '/workflows', element: <RoleRoute user={user} minRole="developer"><Navigate to="/settings/traffic?tab=workflows" replace /></RoleRoute> },
    { path: '/automations', element: <RoleRoute user={user} minRole="developer"><Navigate to="/settings/traffic?tab=automations" replace /></RoleRoute> },
    { path: '/users', element: <RoleRoute user={user} minRole="developer"><Navigate to="/settings/security?tab=users" replace /></RoleRoute> }
  ]), [user]);

  if (authLoading) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500">Loading...</div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider user={user}>
        <AppTextProvider key={user ? 'authed' : 'anon'}>
          <SettingsStoreProvider>
            <Suspense fallback={<PageLoader />}>
              <RouterProvider router={router} />
            </Suspense>
          </SettingsStoreProvider>
        </AppTextProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}