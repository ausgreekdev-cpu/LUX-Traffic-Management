import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Register() {
  const [form, setForm] = useState({ name:'', email:'', password:'', companyName:'' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      localStorage.setItem('token', data.token);
      navigate('/');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md card p-6">
        <h1 className="text-2xl font-bold text-center">Create your workspace</h1>
        <p className="text-sm text-gray-500 text-center mt-1">Everyone from your company will be sandboxed together by email domain</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full border rounded px-3 py-2" required />
          <input placeholder="Work email (e.g. you@acme.com.au)" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="w-full border rounded px-3 py-2" required />
          <input placeholder="Company name" value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} className="w-full border rounded px-3 py-2" />
          <input type="password" placeholder="Password (≥8 chars)" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="w-full border rounded px-3 py-2" required />
          <p className="text-xs text-gray-500">If your company already has a workspace (same email domain), you’ll join it. Personal emails (gmail.com) get a private sandbox.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-lux-500 text-white py-2 rounded-lg">{loading?'Creating…':'Create workspace'}</button>
        </form>
        <p className="text-sm text-center mt-4"><Link to="/login" className="text-lux-600 hover:underline">Already have an account? Log in</Link></p>
      </div>
    </div>
  );
}
