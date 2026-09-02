import { useEffect, useRef, useState } from 'react';
import { FeatureGate } from '../components/EntitlementGate';
import api from '../api';
import 'mapbox-gl/dist/mapbox-gl.css';

const SIGNS = [
  { id: 'T1-1', label: 'Road Work Ahead', icon: '🚧', color: '#f59e0b' },
  { id: 'T1-2', label: 'Road Work 1km', icon: '🛣️', color: '#f59e0b' },
  { id: 'R4-1', label: 'Speed 40', icon: '40', color: '#dc2626' },
  { id: 'R4-2', label: 'Speed 60', icon: '60', color: '#dc2626' },
  { id: 'T2-1', label: 'Detour', icon: '↗️', color: '#2563eb' },
  { id: 'T3-1', label: 'Stop/Slow', icon: '🛑', color: '#dc2626' },
];

export default function GisGenerator() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [signs, setSigns] = useState([]);
  const [selectedSign, setSelectedSign] = useState(SIGNS[0]);
  const [mapReady, setMapReady] = useState(false);
  const [tmpId, setTmpId] = useState('');

  const selectedRef = useRef(selectedSign);
  useEffect(() => { selectedRef.current = selectedSign; }, [selectedSign]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const mod = await import('mapbox-gl');
        const mapboxgl = mod.default;
        let token = import.meta.env.VITE_MAPBOX_TOKEN;
        try {
          const s = await api.settings.get().catch(()=>null);
          if (s?.api_keys?.mapbox_token) token = s.api_keys.mapbox_token;
        } catch {}
        if (!token) {
          console.warn('Mapbox token missing — set VITE_MAPBOX_TOKEN or Settings > API Keys');
          return;
        }
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [115.8605, -31.9505],
          zoom: 12,
        });
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }));
        map.on('load', () => { if (!cancelled) setMapReady(true); });
        map.on('click', (e) => {
          const { lng, lat } = e.lngLat;
          const s = selectedRef.current;
          const markerEl = document.createElement('div');
          markerEl.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border bg-white shadow';
          markerEl.style.borderColor = s.color;
          markerEl.textContent = s.icon;
          new mapboxgl.Marker({ element: markerEl }).setLngLat([lng, lat]).addTo(map);
          setSigns(prev => [...prev, { ...s, lng, lat, id: Date.now() }]);
        });
        mapInstance.current = map;
      } catch (e) { console.warn('Mapbox init failed', e.message); }
    }
    init();
    return () => { cancelled = true; try { mapInstance.current?.remove(); } catch {} };
  }, []);

  const exportAs = async (type) => {
    if (!tmpId) return alert('Enter TMP ID to export (or create TMP first)');
    try {
      if (type === 'pdf') {
        const res = await api.export.councilPDF(tmpId);
        // export.councilPDF returns fetch Response, need to handle
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${tmpId}-tcd.pdf`; a.click(); URL.revokeObjectURL(url);
      } else if (type === 'geojson') {
        const res = await api.export.geoJSON(tmpId);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${tmpId}.geojson`; a.click(); URL.revokeObjectURL(url);
      } else if (type === 'svg') {
        const url = api.export.sitePlan(tmpId);
        window.open(url, '_blank');
      }
    } catch (e) { alert(e.message); }
  };

  const saveTgs = async () => {
    if (!tmpId) return alert('Enter TMP ID');
    const layout = { signs, center: mapInstance.current?.getCenter(), zoom: mapInstance.current?.getZoom(), chainage: '0+000', scale: '1:500' };
    try {
      await fetch('/api/gis/tgs', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}`}, body: JSON.stringify({ tmp_id: tmpId, layout_json: layout })});
      alert('TCD saved');
    } catch (e) { alert(e.message); }
  };

  return (
    <FeatureGate feature="gis_generator">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">GIS / TCD Generator — Mapbox</h1>
            <p className="text-sm text-gray-500">AS 1742.3 sign library • Chainage • Scale • Export PDF / GeoJSON / SVG</p>
          </div>
          <div className="flex gap-2 items-center">
            <input placeholder="TMP ID" value={tmpId} onChange={e=>setTmpId(e.target.value)} className="input w-40 text-sm" />
            <button onClick={saveTgs} className="px-3 py-1.5 bg-lux-500 text-white rounded text-sm">Save TGS</button>
          </div>
        </div>

        <div className="mt-4 flex gap-4">
          <div className="w-48 shrink-0 card p-3 h-fit">
            <h3 className="font-semibold text-sm mb-2">Sign Library (AS 1742.3)</h3>
            <div className="grid grid-cols-2 gap-2">
              {SIGNS.map(s => (
                <button key={s.id} onClick={()=>setSelectedSign(s)} className={`p-2 rounded border text-center ${selectedSign.id===s.id?'bg-lux-500 text-white border-lux-500':'bg-white hover:bg-gray-50'}`}>
                  <div className="text-lg" style={{color: selectedSign.id===s.id ? 'white' : s.color}}>{s.icon}</div>
                  <div className="text-[10px] leading-tight">{s.id}</div>
                  <div className="text-[9px] truncate">{s.label}</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-2">Click map to place {selectedSign.id}. North ↑ always top.</p>
            <div className="mt-3">
              <p className="text-xs font-medium">Placed: {signs.length}</p>
              <button onClick={()=>setSigns([])} className="text-xs text-red-600 hover:underline">Clear all</button>
            </div>
          </div>

          <div className="flex-1">
            <div ref={mapRef} className="w-full h-[520px] rounded-lg border overflow-hidden bg-gray-100 relative">
              {!mapReady && <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">Loading Mapbox… Need MAPBOX_TOKEN (Settings → API Keys or VITE_MAPBOX_TOKEN)</div>}
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={()=>exportAs('pdf')} className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm">Export PDF (Council)</button>
              <button onClick={()=>exportAs('geojson')} className="px-3 py-1.5 border rounded text-sm">Export GeoJSON</button>
              <button onClick={()=>exportAs('svg')} className="px-3 py-1.5 border rounded text-sm">Export SVG</button>
              <span className="text-xs text-gray-500 ml-auto">WA LGA rule engine: paired packet for MRWA/LGA • Scale 1:500 • Chainage 0+000</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid md:grid-cols-3 gap-4 text-xs">
          <div className="border rounded p-3"><strong>Starter</strong>: View only, no export</div>
          <div className="border rounded p-3 bg-amber-50"><strong>Pro</strong>: Single LGA packet, unlimited PDF • <span className="text-amber-700">Current</span></div>
          <div className="border rounded p-3"><strong>Agency</strong>: Paired MRWA+ LGA packets + API</div>
        </div>
      </div>
    </FeatureGate>
  );
}
