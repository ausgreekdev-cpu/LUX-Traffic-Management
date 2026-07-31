// Seeds the WA Local Government Directory into the authorities table on first run,
// and exposes the upsert/deserialize helpers used by the PDF import endpoint.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, '..', 'data', 'wa-lga-directory.json');

const STAT_KEYS = ['distance_km', 'electors', 'area_sqkm', 'dwellings', 'sealed_roads_km', 'rates_levied', 'unsealed_roads_km', 'revenue', 'population', 'employees'];

export function deserializeAuthority(row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of ['councillors', 'suburbs', 'statistics']) {
    if (out[key] != null) {
      try { out[key] = JSON.parse(out[key]); } catch { out[key] = null; }
    }
  }
  return out;
}

function slugId(entry) {
  const base = (entry.short_name || entry.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'lga-' + base;
}

function toRow(entry, source) {
  const statistics = {};
  for (const key of STAT_KEYS) if (entry[key] != null) statistics[key] = entry[key];
  return {
    id: entry.id || slugId(entry),
    name: entry.name,
    short_name: entry.short_name || null,
    type: 'lga',
    email: entry.email || null,
    phone: entry.phone || null,
    website: entry.website || null,
    address: entry.address || null,
    council_type: entry.council_type || null,
    abn: entry.abn || null,
    band: entry.band ?? null,
    suburb: entry.suburb || null,
    postcode: entry.postcode || null,
    mayor: entry.mayor || null,
    deputy: entry.deputy || null,
    ceo: entry.ceo || null,
    councillors: Array.isArray(entry.councillors) ? JSON.stringify(entry.councillors) : null,
    executive_team: entry.executive_team || null,
    suburbs: Array.isArray(entry.suburbs) ? JSON.stringify(entry.suburbs) : null,
    meeting_schedule: entry.meeting_schedule || null,
    map_coordinates: entry.map_coordinates || null,
    zone: entry.zone || null,
    statistics: Object.keys(statistics).length ? JSON.stringify(statistics) : null,
    directory_source: source,
    directory_updated_at: new Date().toISOString()
  };
}

const upsert = db.prepare(`
  INSERT INTO authorities (
    id, name, short_name, type, email, phone, website, address, council_type, abn, band,
    suburb, postcode, mayor, deputy, ceo, councillors, executive_team, suburbs,
    meeting_schedule, map_coordinates, zone, statistics, directory_source, directory_updated_at
  ) VALUES (
    @id, @name, @short_name, @type, @email, @phone, @website, @address, @council_type, @abn, @band,
    @suburb, @postcode, @mayor, @deputy, @ceo, @councillors, @executive_team, @suburbs,
    @meeting_schedule, @map_coordinates, @zone, @statistics, @directory_source, @directory_updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, short_name = excluded.short_name, type = excluded.type,
    email = excluded.email, phone = excluded.phone, website = excluded.website,
    address = excluded.address, council_type = excluded.council_type, abn = excluded.abn,
    band = excluded.band, suburb = excluded.suburb, postcode = excluded.postcode,
    mayor = excluded.mayor, deputy = excluded.deputy, ceo = excluded.ceo,
    councillors = excluded.councillors, executive_team = excluded.executive_team,
    suburbs = excluded.suburbs, meeting_schedule = excluded.meeting_schedule,
    map_coordinates = excluded.map_coordinates, zone = excluded.zone,
    statistics = excluded.statistics, directory_source = excluded.directory_source,
    directory_updated_at = excluded.directory_updated_at,
    updated_at = datetime('now')
`);

export function upsertDirectoryEntries(entries, source) {
  let inserted = 0;
  let updated = 0;
  const tx = db.transaction(() => {
    for (const entry of entries) {
      const row = toRow(entry, source);
      const existing = db.prepare('SELECT id FROM authorities WHERE id = ?').get(row.id);
      upsert.run(row);
      if (existing) updated++; else inserted++;
    }
  });
  tx();
  return { inserted, updated };
}

export function loadSeedEntries() {
  if (!fs.existsSync(SEED_FILE)) return [];
  const payload = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
  return Array.isArray(payload.entries) ? payload.entries : [];
}

export function seedDirectoryIfEmpty() {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM authorities').get();
  if (c > 0) return { seeded: 0, skipped: 'authorities already populated' };
  const entries = loadSeedEntries();
  if (!entries.length) return { seeded: 0, skipped: 'seed file not found' };
  const result = upsertDirectoryEntries(entries, 'WALGA Local Government Directory 2026 (seed)');
  return { seeded: result.inserted, updated: result.updated };
}
