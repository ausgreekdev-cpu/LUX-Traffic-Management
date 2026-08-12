import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import api from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TMPList from './pages/TMPList';
import TMPDetail from './pages/TMPDetail';
import TMPForm from './pages/TMPForm';
import ClientList from './pages/ClientList';
import SiteList from './pages/SiteList';
import ProjectList from './pages/ProjectList';
import AuthorityList from './pages/AuthorityList';
import PermitList from './pages/PermitList';
import PermitDetail from './pages/PermitDetail';
import PermitForm from './pages/PermitForm';
import TimeTracking from './pages/TimeTracking';
import Analytics from './pages/Analytics';
import UsersList from './pages/UsersList';
import Settings from './pages/Settings';
import Help from './pages/Help';
import WorkflowSettings from './pages/WorkflowSettings';
import AutomationSettings from './pages/AutomationSettings';
import Correspondence from './pages/Correspondence';
import ErrorBoundary from './components/ErrorBoundary';
import { AppTextProvider } from './context/AppText';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.auth.me().then(setUser).catch(() => { localStorage.removeItem('token'); });
    }
  }, []);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <ErrorBoundary>
      <AppTextProvider key={user ? 'authed' : 'anon'}>
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/" element={<ProtectedRoute><Layout user={user} onLogout={handleLogout} /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="tmps" element={<TMPList />} />
            <Route path="tmps/new" element={<TMPForm />} />
            <Route path="tmps/:id" element={<TMPDetail />} />
            <Route path="tmps/:id/edit" element={<TMPForm />} />
            <Route path="projects" element={<ProjectList />} />
            <Route path="clients" element={<ClientList />} />
            <Route path="sites" element={<SiteList />} />
            <Route path="authorities" element={<AuthorityList />} />
            <Route path="permits" element={<PermitList />} />
            <Route path="permits/new" element={<PermitForm />} />
            <Route path="permits/:id" element={<PermitDetail />} />
            <Route path="permits/:id/edit" element={<PermitForm />} />
            <Route path="time-tracking" element={<TimeTracking />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />
            <Route path="workflows" element={<WorkflowSettings />} />
            <Route path="automations" element={<AutomationSettings />} />
            <Route path="correspondence" element={<Correspondence />} />
            <Route path="users" element={<UsersList />} />
          </Route>
        </Routes>
      </AppTextProvider>
    </ErrorBoundary>
  );
}
