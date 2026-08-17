import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import api from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { AppTextProvider } from './context/AppText';
import { AuthProvider, RANK } from './context/Auth';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const TMPList = lazy(() => import('./pages/TMPList'));
const TMPDetail = lazy(() => import('./pages/TMPDetail'));
const TMPForm = lazy(() => import('./pages/TMPForm'));
const ClientList = lazy(() => import('./pages/ClientList'));
const SiteList = lazy(() => import('./pages/SiteList'));
const ProjectList = lazy(() => import('./pages/ProjectList'));
const AuthorityList = lazy(() => import('./pages/AuthorityList'));
const PermitList = lazy(() => import('./pages/PermitList'));
const PermitDetail = lazy(() => import('./pages/PermitDetail'));
const PermitForm = lazy(() => import('./pages/PermitForm'));
const TimeTracking = lazy(() => import('./pages/TimeTracking'));
const Analytics = lazy(() => import('./pages/Analytics'));
const UsersList = lazy(() => import('./pages/UsersList'));
const Settings = lazy(() => import('./pages/Settings'));
const Help = lazy(() => import('./pages/Help'));
const WorkflowSettings = lazy(() => import('./pages/WorkflowSettings'));
const AutomationSettings = lazy(() => import('./pages/AutomationSettings'));
const Correspondence = lazy(() => import('./pages/Correspondence'));
const Kanban = lazy(() => import('./pages/Kanban'));
const Branding = lazy(() => import('./pages/Branding'));

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
        await fetch('/api/ping', { cache: 'no-store' });
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
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />
              <Route path="/" element={<ProtectedRoute><Layout user={user} onLogout={handleLogout} /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="tmps" element={<TMPList />} />
                <Route path="kanban" element={<Kanban />} />
                <Route path="tmps/new" element={<RoleRoute user={user} minRole="staff"><TMPForm /></RoleRoute>} />
                <Route path="tmps/:id" element={<TMPDetail />} />
                <Route path="tmps/:id/edit" element={<RoleRoute user={user} minRole="staff"><TMPForm /></RoleRoute>} />
                <Route path="projects" element={<ProjectList />} />
                <Route path="clients" element={<ClientList />} />
                <Route path="sites" element={<RoleRoute user={user} minRole="staff"><SiteList /></RoleRoute>} />
                <Route path="authorities" element={<AuthorityList />} />
                <Route path="permits" element={<PermitList />} />
                <Route path="permits/new" element={<RoleRoute user={user} minRole="staff"><PermitForm /></RoleRoute>} />
                <Route path="permits/:id" element={<PermitDetail />} />
                <Route path="permits/:id/edit" element={<RoleRoute user={user} minRole="staff"><PermitForm /></RoleRoute>} />
                <Route path="time-tracking" element={<RoleRoute user={user} minRole="staff"><TimeTracking /></RoleRoute>} />
                <Route path="analytics" element={<RoleRoute user={user} minRole="staff"><Analytics /></RoleRoute>} />
                <Route path="settings" element={<RoleRoute user={user} minRole="developer"><Settings /></RoleRoute>} />
                <Route path="help" element={<Help />} />
                <Route path="workflows" element={<RoleRoute user={user} minRole="developer"><WorkflowSettings /></RoleRoute>} />
                <Route path="automations" element={<RoleRoute user={user} minRole="developer"><AutomationSettings /></RoleRoute>} />
                <Route path="correspondence" element={<RoleRoute user={user} minRole="manager"><Correspondence /></RoleRoute>} />
                <Route path="users" element={<RoleRoute user={user} minRole="developer"><UsersList /></RoleRoute>} />
                <Route path="branding" element={<RoleRoute user={user} minRole="developer"><Branding /></RoleRoute>} />
              </Route>
            </Routes>
          </Suspense>
        </AppTextProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
