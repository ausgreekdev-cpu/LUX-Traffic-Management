import { useFeature } from '../hooks/useEntitlement';

export function FeatureGate({ feature, children, fallback }) {
  const { allowed, loading } = useFeature(feature);
  if (loading) return null;
  if (allowed) return children;
  return fallback || <Upsell feature={feature} />;
}

export function Upsell({ feature, limit }) {
  const labels = {
    gis_generator: { title: 'GIS/TCD Generator', desc: 'Design AS 1742.3-compliant diagrams on Mapbox. Requires Pro.' },
    geojson_export: { title: 'GeoJSON Export', desc: 'Export TMP site plans as GeoJSON. Requires Pro.' },
    wa_lga_packet: { title: 'WA LGA Packet', desc: 'Create council permit packets. Requires Pro (single) or Agency (paired MRWA+LGA).' },
    dispatch: { title: 'Team Dispatch', desc: 'Rostering + SMS dispatch and dispatch lanes. Requires Agency.' },
    mobile_offline: { title: 'Field Offline Mode', desc: 'Offline caching and photo queue for field crews. Requires Pro.' },
    white_label: { title: 'White-Label', desc: 'Custom domain & branding. Requires Agency.' },
    api_access: { title: 'API Access', desc: 'External API and integrations (webhooks, correspondence). Requires Agency.' },
    custom_domain: { title: 'Custom Domain', desc: 'Branded domain mapping. Requires Agency.' },
    sso_saml: { title: 'Single Sign-On (SSO/SAML)', desc: 'Enterprise SSO via SAML / OAuth2. Requires Enterprise.' },
    ai_autolayout: { title: 'AI Auto-Layout', desc: 'AI-powered TCD auto-layout. Requires Enterprise.' },
    active_projects: { title: 'Project Limit Reached', desc: limit ? `Limit ${limit} active projects. Upgrade to Pro (25) or Agency (unlimited).` : 'Upgrade required.' },
  };
  const info = labels[feature] || { title: feature, desc: 'This feature requires upgrade.' };
  return (
    <div className="border-2 border-amber-300 bg-amber-50 rounded-lg p-4 text-center">
      <h3 className="font-bold text-amber-800">{info.title}</h3>
      <p className="text-sm text-amber-700 mt-1">{info.desc}</p>
      <a href="/billing" className="inline-block mt-3 bg-amber-500 text-white px-4 py-1.5 rounded">View Plans — Starter $79 → Agency $499</a>
    </div>
  );
}
