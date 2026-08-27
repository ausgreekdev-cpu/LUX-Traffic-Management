import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const LGA_DIR_PATH = path.join(__dirname, '..', 'data', 'wa-lga-directory.json');

// In-memory cache for suburb -> LGA mapping
let suburbToLgaMap = null;
let lgaData = null;

function loadLgaData() {
  if (lgaData) return lgaData;
  const raw = fs.readFileSync(LGA_DIR_PATH, 'utf8');
  lgaData = JSON.parse(raw);
  return lgaData;
}

function buildSuburbMap() {
  if (suburbToLgaMap) return suburbToLgaMap;
  const data = loadLgaData();
  const map = new Map();
  for (const lga of data.entries) {
    const lgaId = lga.name.toLowerCase().replace(/\s+/g, '_');
    if (lga.suburbs && Array.isArray(lga.suburbs)) {
      for (const suburb of lga.suburbs) {
        const key = suburb.name.toLowerCase().trim();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ lgaId, lgaName: lga.name, postcode: suburb.postcode });
      }
    }
    // Also index by short_name
    if (lga.short_name) {
      const key = lga.short_name.toLowerCase().trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ lgaId, lgaName: lga.name, postcode: null });
    }
  }
  suburbToLgaMap = map;
  return map;
}

/**
 * Determine jurisdiction for a site based on coordinates, suburb, road class, and authority.
 * Returns: 'lga', 'state', or 'shared'
 */
export function deriveJurisdiction({ latitude: _latitude, longitude: _longitude, suburb, postcode, road_class, authority_id }) {
  // State roads: MRWA manages arterial, highway, freeway
  const isStateRoad = ['arterial', 'highway', 'freeway'].includes(road_class?.toLowerCase());
  
  // If explicitly bound to MRWA authority, it's state
  if (authority_id) {
    const auth = db.prepare('SELECT type FROM authorities WHERE id = ?').get(authority_id);
    if (auth?.type === 'mrwa') return 'state';
    if (auth?.type === 'lga') return 'lga';
  }

  // Suburb-based LGA lookup
  const suburbMap = buildSuburbMap();
  let matchedLga = null;
  if (suburb) {
    const key = suburb.toLowerCase().trim();
    const matches = suburbMap.get(key);
    if (matches && matches.length > 0) {
      // If postcode provided, try to narrow down
      if (postcode) {
        const withPostcode = matches.filter(m => m.postcode && m.postcode === postcode);
        if (withPostcode.length > 0) matchedLga = withPostcode[0].lgaName;
        else matchedLga = matches[0].lgaName;
      } else {
        matchedLga = matches[0].lgaName;
      }
    }
  }

  // Determine jurisdiction
  if (isStateRoad && matchedLga) return 'shared';
  if (isStateRoad) return 'state';
  if (matchedLga) return 'lga';
  
  // Default: LGA if we have a suburb match, otherwise unknown
  return matchedLga ? 'lga' : 'unknown';
}

/**
 * Get LGA name for a suburb/postcode
 */
export function getLgaForSuburb(suburb, postcode = null) {
  const suburbMap = buildSuburbMap();
  const key = suburb?.toLowerCase().trim();
  if (!key) return null;
  const matches = suburbMap.get(key);
  if (!matches || matches.length === 0) return null;
  if (postcode) {
    const withPostcode = matches.filter(m => m.postcode && m.postcode === postcode);
    if (withPostcode.length > 0) return withPostcode[0].lgaName;
  }
  return matches[0].lgaName;
}

/**
 * Get all LGAs that contain a suburb
 */
export function getLgasForSuburb(suburb) {
  const suburbMap = buildSuburbMap();
  const key = suburb?.toLowerCase().trim();
  if (!key) return [];
  return suburbMap.get(key) || [];
}

/**
 * Check if a road class is a state-managed road
 */
export function isStateRoad(roadClass) {
  return ['arterial', 'highway', 'freeway'].includes(roadClass?.toLowerCase());
}

/**
 * Get the relevant authorities for a TMP based on jurisdiction
 * Returns array of authority IDs that should receive permit applications
 */
export function getRelevantAuthorities({ jurisdiction, authority_id, site_id }) {
  const authorities = [];
  
  if (jurisdiction === 'state' || jurisdiction === 'shared') {
    // Add MRWA
    const mrwa = db.prepare("SELECT id FROM authorities WHERE type = 'mrwa' LIMIT 1").get();
    if (mrwa) authorities.push(mrwa.id);
  }
  
  if (jurisdiction === 'lga' || jurisdiction === 'shared') {
    // Add the bound LGA authority
    if (authority_id) {
      const auth = db.prepare('SELECT id, type FROM authorities WHERE id = ?').get(authority_id);
      if (auth && auth.type === 'lga') authorities.push(auth.id);
    } else if (site_id) {
      // Try to find LGA from site
      const site = db.prepare('SELECT suburb, postcode FROM sites WHERE id = ?').get(site_id);
      if (site) {
        const lgaName = getLgaForSuburb(site.suburb, site.postcode);
        if (lgaName) {
          const auth = db.prepare("SELECT id FROM authorities WHERE name = ? AND type = 'lga'").get(lgaName);
          if (auth) authorities.push(auth.id);
        }
      }
    }
  }
  
  return [...new Set(authorities)]; // deduplicate
}

/**
 * Get permit packet configuration for a jurisdiction
 * Returns config for creating paired permit packets
 */
export function getPermitPacketConfig(jurisdiction) {
  const base = {
    lga: { requires_lga_permit: true, requires_mrwa_permit: false, workflow_template: 'lga_standard' },
    state: { requires_lga_permit: false, requires_mrwa_permit: true, workflow_template: 'mrwa_standard' },
    shared: { requires_lga_permit: true, requires_mrwa_permit: true, workflow_template: 'shared_standard' },
    unknown: { requires_lga_permit: true, requires_mrwa_permit: false, workflow_template: 'lga_standard' }
  };
  return base[jurisdiction] || base.unknown;
}

export function reloadLgaData() {
  suburbToLgaMap = null;
  lgaData = null;
  buildSuburbMap();
}