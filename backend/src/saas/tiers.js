/**
 * Tier definitions for Delux TPM CRM — single source of truth for gating.
 * AUD ex GST. Annual -20%.
 */
export const TIERS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 79,
    priceAnnual: 756, // 63*12
    seatsIncluded: 2,
    extraSeatPrice: 39,
    limits: {
      seats: 2,
      active_projects: 5,
      pdf_exports_per_month: 10,
      storage_gb: 10,
      api_calls_per_day: 1000,
    },
    features: {
      gis_generator: false,
      geojson_export: false,
      wa_lga_packet: false,
      dispatch: false,
      mobile_offline: false, // read-only mobile
      white_label: false,
      api_access: false,
      custom_domain: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 199,
    priceAnnual: 1908, // 159*12
    seatsIncluded: 5,
    extraSeatPrice: 39,
    limits: {
      seats: 5,
      active_projects: 25,
      pdf_exports_per_month: Infinity,
      storage_gb: 100,
      api_calls_per_day: 10000,
    },
    features: {
      gis_generator: true,
      geojson_export: true,
      wa_lga_packet: true, // single LGA
      dispatch: false, // list view only
      mobile_offline: true,
      white_label: false, // logo only
      api_access: false, // read-only
      custom_domain: false,
    },
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    priceMonthly: 499,
    priceAnnual: 4788, // 399*12
    seatsIncluded: 15,
    extraSeatPrice: 29,
    limits: {
      seats: 15,
      active_projects: Infinity,
      pdf_exports_per_month: Infinity,
      storage_gb: 500,
      api_calls_per_day: 100000,
    },
    features: {
      gis_generator: true,
      geojson_export: true,
      wa_lga_packet: true, // paired packets
      dispatch: true,
      mobile_offline: true,
      white_label: true,
      api_access: true,
      custom_domain: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: null, // custom
    priceAnnual: null,
    seatsIncluded: Infinity,
    extraSeatPrice: 0,
    limits: {
      seats: Infinity,
      active_projects: Infinity,
      pdf_exports_per_month: Infinity,
      storage_gb: Infinity,
      api_calls_per_day: Infinity,
    },
    features: {
      gis_generator: true,
      geojson_export: true,
      wa_lga_packet: true,
      dispatch: true,
      mobile_offline: true,
      white_label: true,
      api_access: true,
      custom_domain: true,
      sso_saml: true,
      ai_autolayout: true,
    },
  },
  trial: {
    id: 'trial',
    name: 'Trial (Pro)',
    priceMonthly: 0,
    seatsIncluded: 2,
    limits: { seats: 2, active_projects: 3, pdf_exports_per_month: 3, storage_gb: 5, api_calls_per_day: 500 },
    features: { gis_generator: true, geojson_export: true, wa_lga_packet: true, dispatch: false, mobile_offline: false, white_label: false, api_access: false, custom_domain: false },
  },
};

export const FEATURE_KEYS = [
  'gis_generator','geojson_export','wa_lga_packet','dispatch','mobile_offline','white_label','api_access','custom_domain','sso_saml','ai_autolayout',
];

export function getTier(plan) {
  return TIERS[plan] || TIERS.starter;
}

export function isFeatureAllowed(plan, featureKey) {
  const tier = getTier(plan);
  return !!tier.features[featureKey];
}

export function getLimit(plan, limitKey) {
  const tier = getTier(plan);
  return tier.limits[limitKey];
}
