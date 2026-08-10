import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAppText } from '../context/AppText';

export default function Login({ onLogin }) {
  const { appName, settings } = useAppText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.login({ email, password });
      localStorage.setItem('token', res.token);
      onLogin(res.user);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-lux-900/50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center mb-8">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-lux-500 flex items-center justify-center shadow-lg shadow-lux-500/30 mb-4">
              <span className="font-black text-gray-900 text-lg tracking-tight">LUX</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{appName('LUX Traffic Management')}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1.5 text-sm">{settings.login_subtitle || 'Sign in to your workspace'}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input w-full" placeholder="you@company.com.au" required />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input w-full" placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={loading}
              className="btn btn-primary w-full py-2.5">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
          {appName('LUX Traffic Management')} · offline desktop app
        </p>
        {(settings.privacy_policy || settings.terms_of_service) && (
          <p className="text-center text-xs mt-2 space-x-3">
            {settings.privacy_policy && <Link to="/help#privacy" className="text-gray-500 dark:text-gray-400 hover:text-lux-600 dark:hover:text-lux-400">Privacy Policy</Link>}
            {settings.terms_of_service && <Link to="/help#terms" className="text-gray-500 dark:text-gray-400 hover:text-lux-600 dark:hover:text-lux-400">Terms of Service</Link>}
          </p>
        )}
      </div>
    </div>
  );
}
