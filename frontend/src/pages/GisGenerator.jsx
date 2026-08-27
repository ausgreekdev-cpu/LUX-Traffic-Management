import { useState } from 'react';
import { FeatureGate } from '../components/EntitlementGate';

export default function GisGenerator() {
  return (
    <FeatureGate feature="gis_generator">
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold">GIS / TCD Generator — Mapbox</h1>
        <p className="text-sm text-gray-500">AS 1742.3 sign library • Chainage • Scale • Export PDF / GeoJSON / SVG</p>
        <div className="mt-4 border-2 border-dashed rounded-lg h-[520px] flex items-center justify-center bg-gray-50 relative">
          <div className="text-center">
            <p className="font-semibold">Mapbox Canvas (Pro+)</p>
            <p className="text-xs text-gray-500">Set MAPBOX_TOKEN env. Drag-drop signs, auto-scale, north arrow.</p>
            <div className="mt-3 flex gap-2 justify-center">
              <button className="px-3 py-1 bg-gray-900 text-white rounded">Export PDF</button>
              <button className="px-3 py-1 border rounded">Export GeoJSON</button>
              <button className="px-3 py-1 border rounded">Export SVG</button>
            </div>
          </div>
          <div className="absolute bottom-2 right-2 text-[10px] text-gray-400">WA LGA rule engine: paired packet for MRWA/LGA</div>
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-4 text-xs">
          <div className="border rounded p-3"><strong>Starter</strong>: View only, no export</div>
          <div className="border rounded p-3 bg-amber-50"><strong>Pro</strong>: Single LGA packet, unlimited PDF</div>
          <div className="border rounded p-3"><strong>Agency</strong>: Paired MRWA+ LGA packets + API</div>
        </div>
      </div>
    </FeatureGate>
  );
}
