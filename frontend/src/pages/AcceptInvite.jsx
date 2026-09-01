import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ name:'', password:'' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(()=>{
    if (!token) return;
    fetch(`/api/auth/invitation/${encodeURIComponent(token)}`).then(r=>r.json()).then(d=>{ if(d.error) setError(d.error); else setInfo(d); }).catch(()=>setError('Failed to load invitation'));
  },[token]);

  const submit = async (e)=>{
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/accept', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, name: form.name, password: form.password })});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('token', data.token);
      navigate('/');
    } catch(err){ setError(err.message); }
  };

  if (!token) return <div className="p-8 text-center">No token</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md card p-6">
        <h1 className="text-xl font-bold">Join {info?.tenant_name || 'workspace'}</h1>
        <p className="text-sm text-gray-500">{info?.email} • {info?.role}</p>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input placeholder="Your name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full border rounded px-3 py-2" />
          <input type="password" placeholder="Choose password (≥8 chars)" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="w-full border rounded px-3 py-2" required />
          <button type="submit" className="w-full bg-lux-500 text-white py-2 rounded">Accept invitation</button>
        </form>
        <p className="text-sm text-center mt-4"><Link to="/login" className="text-lux-600 hover:underline">Back to login</Link></p>
      </div>
    </div>
  );
}
