import { useEffect, useState } from 'react';
import { useEntitlements } from '../hooks/useEntitlement';

const TIERS = [
  { id:'starter', name:'Starter', price:'$79/mo', annual:'$756/yr', seats:2, projects:5, features:['5 active TCPs','10 PDFs/mo','Email 48h'] },
  { id:'pro', name:'Pro', price:'$199/mo', annual:'$1,908/yr', seats:5, projects:25, features:['GIS Generator','WA LGA Packets','Unlimited PDFs','GeoJSON'] , highlight:true },
  { id:'agency', name:'Agency', price:'$499/mo', annual:'$4,788/yr', seats:15, projects:'∞', features:['White-label','Dispatch + SMS','API','Unlimited'] },
];

export default function Billing() {
  const { ent } = useEntitlements();
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState(null);
  const [annual, setAnnual] = useState(false);
  const [seats, setSeats] = useState(1);
  useEffect(()=>{ fetch('/api/billing/plans').then(r=>r.json()).then(setPlans).catch(()=>{}); },[]);
  useEffect(()=>{ fetch('/api/billing/usage', { headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(r=>r.json()).then(setUsage).catch(()=>{}); },[]);

  const checkout = async (tier) => {
    // Server-provided priceIds from GET /api/billing/plans
    const plan = plans.find(p=>p.id===tier);
    const priceId = annual ? plan?.priceIdAnnual : plan?.priceIdMonthly;
    if (!priceId) return alert('Price ID not configured for ' + tier + (annual?' annual':' monthly') + ' — set STRIPE_PRICE_* in backend/Netlify env and redeploy');
    const res = await fetch('/api/billing/checkout', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}`}, body: JSON.stringify({ priceId, seats, planId: tier, annual })});
    const data = await res.json();
    if (data.url) window.location = data.url;
    else alert(data.error || 'Stripe not configured — contact AusGreek Developments');
  };

  // Helpers for meter display
  const fmtLimit = (v) => v === Infinity || v === null ? '∞' : String(v);
  const storageMeter = usage?.storage_gb || usage?.storage;
  const apiMeter = usage?.api_calls || usage?.apiCalls;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold">Delux TPM CRM — Plans</h1>
      <p className="text-gray-500">Current: <span className="font-semibold">{ent?.tenant?.plan || '—'}</span> {ent?.tenant?.status ? `(${ent.tenant.status})` : ''} {usage && `• Seats ${usage.seats.used}/${fmtLimit(usage.seats.limit)} • Projects ${usage.projects.used}/${fmtLimit(usage.projects.limit)} • PDFs ${usage.pdfs.used}/${fmtLimit(usage.pdfs.limit)}`}{usage && storageMeter ? ` • Storage ${storageMeter.used} GB / ${fmtLimit(storageMeter.limit)} GB` : ''}{usage && apiMeter ? ` • API ${apiMeter.used}/${fmtLimit(apiMeter.limit)}/day` : ''}</p>
      <div className="flex gap-2 mt-4 items-center">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={annual} onChange={e=>setAnnual(e.target.checked)} /> Annual (-20%)</label>
        <label className="flex items-center gap-2 text-sm">Seats: <input type="number" min={1} value={seats} onChange={e=>setSeats(Number(e.target.value)||1)} className="border rounded w-16 px-1 py-0.5" /></label>
        <span className="text-xs text-gray-500">Seat billing: Starter $39, Pro $39, Agency $29 extra</span>
      </div>
      <div className="grid md:grid-cols-3 gap-6 mt-6">
        {TIERS.map(t=>(
          <div key={t.id} className={`border rounded-xl p-6 ${t.highlight?'border-amber-400 shadow-lg scale-[1.02]':''} ${ent?.tenant?.plan===t.id?'ring-2 ring-amber-400':''}`}>
            <h2 className="text-xl font-bold">{t.name} {ent?.tenant?.plan===t.id && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Current</span>}</h2>
            <p className="text-2xl font-extrabold mt-2">{annual ? t.annual : t.price} <span className="text-sm font-normal text-gray-500">{annual ? '' : t.annual}</span></p>
            <p className="text-sm text-gray-500">{t.seats} seats incl. • {t.projects} active projects</p>
            <ul className="mt-4 space-y-1 text-sm">{t.features.map(f=><li key={f}>• {f}</li>)}</ul>
            <button onClick={()=>checkout(t.id)} className={`w-full mt-4 py-2 rounded ${t.highlight?'bg-amber-500 text-white':'bg-gray-900 text-white'}`}>Choose {t.name}</button>
          </div>
        ))}
      </div>
      <div className="mt-6 border rounded p-4">
        <h3 className="font-semibold">Manage Subscription</h3>
        <button onClick={async()=>{
          const r=await fetch('/api/billing/portal',{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});
          const d=await r.json(); if(d.url) window.location=d.url; else alert(d.message);
        }} className="mt-2 border px-3 py-1 rounded">Open Customer Portal (upgrade/cancel/seats)</button>
        <p className="text-xs text-gray-500 mt-2">Seat billing: Starter $39, Pro $39, Agency $29 per extra seat (beyond included). PDF overage $0.99. Charged as base qty 1 + extra seats separate line item.</p>
      </div>
      {usage && (
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <div className="border rounded p-4">
            <h4 className="text-sm font-semibold">Storage</h4>
            <p className="text-sm text-gray-600">{storageMeter ? `${storageMeter.used} GB / ${fmtLimit(storageMeter.limit)} GB` : '—'} {storageMeter?.used_bytes ? `(${storageMeter.used_bytes} bytes)` : ''}</p>
            <p className="text-xs text-gray-500 mt-1">Limit from plan: {fmtLimit(ent?.limits?.storage_gb ?? storageMeter?.limit)} GB. Upgrade for more.</p>
          </div>
          <div className="border rounded p-4">
            <h4 className="text-sm font-semibold">API Calls (today)</h4>
            <p className="text-sm text-gray-600">{apiMeter ? `${apiMeter.used} / ${fmtLimit(apiMeter.limit)}` : '—'} per day</p>
            <p className="text-xs text-gray-500 mt-1">Resets daily. Metered in app middleware; bars at limit with 429.</p>
          </div>
          <div className="border rounded p-4">
            <h4 className="text-sm font-semibold">PDF Exports (month)</h4>
            <p className="text-sm text-gray-600">{usage.pdfs.used} / {fmtLimit(usage.pdfs.limit)} this month</p>
            <p className="text-xs text-gray-500 mt-1">Server meters via usage_counters pdf_exports_per_month.</p>
          </div>
        </div>
      )}
    </div>
  );
}
