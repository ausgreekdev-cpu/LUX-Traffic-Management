import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ICON_PERSON = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const ICON_SITE = L.icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iIzFlM2E4YSIvPjxwYXRoIGQ9Ik0xMiA0VjIwTTEyIDRIMjAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12]
});

export default function ImpactMap({ site, recipients = [], radiusM = 200, onRecipientsChange, readOnly = false }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const circleRef = useRef(null);
  const markerRefs = useRef({});
  const [loading, setLoading] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([site.lat, site.lon], 15);
    mapInstance.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Site marker
    L.marker([site.lat, site.lon], { icon: ICON_SITE }).addTo(map).bindPopup(`<b>${site.name || 'Work site'}</b>`);

    // Impact radius circle
    const circle = L.circle([site.lat, site.lon], {
      radius: radiusM,
      color: '#1e3a8a',
      fillColor: '#1e3a8a',
      fillOpacity: 0.1,
      weight: 2,
      dashArray: '8, 4'
    }).addTo(map);
    circleRef.current = circle;

    // Recipient markers
    recipients.forEach((r, i) => {
      if (r.lat && r.lon) {
        const m = L.marker([r.lat, r.lon], { icon: ICON_PERSON, draggable: !readOnly }).addTo(map);
        m.bindPopup(`<b>${r.name}</b><br>${r.address}<br>${r.channel || 'letter'}`);
        if (!readOnly) {
          m.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            onRecipientsChange?.(recipients.map((x, j) => j === i ? { ...x, lat: pos.lat, lon: pos.lng } : x));
          });
        }
        markerRefs.current[i] = m;
      }
    });

    // Click to add recipient (if not readOnly)
    if (!readOnly) {
      map.on('click', async (e) => {
        setLoading(true);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json&addressdetails=1`, {
            headers: { 'User-Agent': 'LUX-Traffic-Management/1.0' }
          });
          if (res.ok) {
            const data = await res.json();
            const addr = data.display_name || `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
            const newRecipient = {
              name: `Occupier`,
              address: addr,
              email: null,
              phone: null,
              channel: 'letter',
              lat: e.latlng.lat,
              lon: e.latlng.lng,
              distance_m: Math.round(haversine(site.lat, site.lon, e.latlng.lat, e.latlng.lng))
            };
            onRecipientsChange?.([...recipients, newRecipient]);
          }
        } finally {
          setLoading(false);
        }
      });
    }

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [site, radiusM, readOnly]);

  // Update radius when prop changes
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusM);
    }
  }, [radiusM]);

  // Update recipient markers
  useEffect(() => {
    if (!mapInstance.current) return;
    recipients.forEach((r, i) => {
      if (r.lat && r.lon) {
        if (markerRefs.current[i]) {
          markerRefs.current[i].setLatLng([r.lat, r.lon]);
        } else {
          const m = L.marker([r.lat, r.lon], { icon: ICON_PERSON, draggable: !readOnly }).addTo(mapInstance.current);
          m.bindPopup(`<b>${r.name}</b><br>${r.address}<br>${r.channel || 'letter'}`);
          if (!readOnly) {
            m.on('dragend', (e) => {
              const pos = e.target.getLatLng();
              onRecipientsChange?.(recipients.map((x, j) => j === i ? { ...x, lat: pos.lat, lon: pos.lng } : x));
            });
          }
          markerRefs.current[i] = m;
        }
      }
    });
    // Remove markers for deleted recipients
    Object.keys(markerRefs.current).forEach((k) => {
      const idx = parseInt(k);
      if (idx >= recipients.length) {
        mapInstance.current.removeLayer(markerRefs.current[k]);
        delete markerRefs.current[k];
      }
    });
  }, [recipients, readOnly]);

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '400px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {loading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">Geocoding…</div>}
      <div className="absolute bottom-2 right-2 bg-white dark:bg-gray-800 p-2 rounded shadow text-xs text-gray-600 dark:text-gray-300">
        Radius: {radiusM} m · {recipients.filter(r => r.lat && r.lon).length} recipients
      </div>
      {!readOnly && (
        <div className="absolute top-2 left-2 bg-white dark:bg-gray-800 p-2 rounded shadow text-xs text-gray-600 dark:text-gray-300">
          Click map to add recipient
        </div>
      )}
    </div>
  );
}