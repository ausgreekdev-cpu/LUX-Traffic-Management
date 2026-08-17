import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAppText } from '../context/AppText';
import { useBranding } from '../context/Branding';

const demoAccounts = [
  { role: 'Developer', email: 'developer@lux.com.au', password: 'Demo123!' },
  { role: 'Manager', email: 'manager@lux.com.au', password: 'Demo123!' },
  { role: 'Staff', email: 'staff@lux.com.au', password: 'Demo123!' },
  { role: 'Client', email: 'client@lux.com.au', password: 'Demo123!' }
];

export default function Login({ onLogin }) {
  const { appName, settings } = useAppText();
  const { branding } = useBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrorKind('');
    setLoading(true);
    try {
      const res = await api.auth.login({ email, password });
      localStorage.setItem('token', res.token);
      onLogin(res.user);
    } catch (err) {
      const message = err.message || 'Login failed';
      setError(message);
      if (message.includes('seconds') || message.includes('Too many')) setErrorKind('lockout');
      else if (message.includes('Invalid email or password') || message.includes('Invalid email')) setErrorKind('badcreds');
      else setErrorKind('other');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-lux-900/50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
            <div className="text-center mb-8">
              {branding?.assets?.logoLight ? (
                <img src={branding.assets.logoLight} alt="logo" className="h-16 mx-auto object-contain mb-4" />
              ) : (
                <div className="h-14 w-14 mx-auto rounded-2xl bg-lux-500 flex items-center justify-center shadow-lg shadow-lux-500/30 mb-4">
                  <span className="font-black text-gray-900 text-lg tracking-tight">LUX</span>
                </div>
              )}
              <h1 className="text-2xl font-bold tracking-tight">{branding?.appName || appName('LUX Traffic Management')}</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1.5 text-sm">{branding?.loginSubtitle || settings.login_subtitle || 'Sign in to your workspace'}</p>
            </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className={`px-4 py-2 rounded-lg text-sm ${errorKind === 'lockout'
                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : errorKind === 'badcreds'
                  ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input w-full" placeholder="you@company.com.au" autoComplete="email" required />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input w-full" placeholder="••••••••" autoComplete="current-password" required />
            </div>
            <button type="submit" disabled={loading}
              className="btn btn-primary w-full py-2.5">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-3">
            <button type="button" onClick={() => setShowDemo(!showDemo)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-lux-600 dark:hover:text-lux-400 font-medium">
              {showDemo ? 'Hide demo accounts' : 'Demo accounts'}
            </button>
            {showDemo && (
              <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 p-3 space-y-1.5">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Try a demo login (password: Demo123!):</p>
                {demoAccounts.map(a => (
                  <button key={a.role} type="button"
                    onClick={() => { setEmail(a.email); setPassword(a.password); setError(''); setErrorKind(''); }}
                    className="w-full text-left text-xs text-gray-600 dark:text-gray-300 hover:text-lux-600 dark:hover:text-lux-400 px-2 py-1 rounded hover:bg-white dark:hover:bg-gray-600 transition-colors">
                    <span className="font-semibold">{a.role}</span> · {a.email}
                  </button>
                ))}
              </div>
            )}
          </div>
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
