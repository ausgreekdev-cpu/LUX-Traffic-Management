// Generates backend/data/wa-lga-directory.json from the extracted WALGA directory text.
// Usage: node backend/scripts/generate-lga-seed.mjs   (input text: LGA_DIRECTORY_TEXT env, else the temp extraction)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDirectory } from '../src/lga-directory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = process.env.LGA_DIRECTORY_TEXT || 'C:/Users/yiann/AppData/Local/Temp/opencode/wa-lga-directory.txt';
const out = path.join(__dirname, '..', 'data', 'wa-lga-directory.json');

const text = fs.readFileSync(src, 'utf-8');
const entries = buildDirectory(text);
if (entries.length !== 139) throw new Error(`Expected 139 entries, got ${entries.length}`);
const bad = entries.filter(e => !e.zone || !e.mayor || !e.ceo || !e.address || !e.phone || !e.email || !e.website || !e.meeting_schedule || !e.map_coordinates || !e.suburbs.length || !e.councillors.length);
if (bad.length) throw new Error(`Incomplete entries: ${bad.map(b => b.name).join(', ')}`);

const payload = {
  source: 'WALGA Local Government Directory 2026',
  generated: new Date().toISOString(),
  entries
};
fs.writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(`Wrote ${entries.length} entries (${fs.statSync(out).size} bytes) to ${out}`);
