import { useEffect, useState } from 'react';

export function useEntitlements() {
  const [ent, setEnt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchEnt() {
      try {
        const res = await fetch('/api/billing/entitlements', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setEnt(data);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    fetchEnt();
    return () => { cancelled = true; };
  }, []);

  const can = (feature) => !!ent?.features?.[feature];
  const limit = (key) => ent?.limits?.[key];
  return { ent, loading, can, limit };
}

export function useFeature(featureKey) {
  const { can, loading } = useEntitlements();
  return { allowed: can(featureKey), loading };
}
