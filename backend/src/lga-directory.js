// Parses the WALGA Local Government Directory PDF text into structured entries.
// Used by: PDF import endpoint (uploads), seed data generation.

function cleanWordArtifacts(s) {
  return s
    .replace(/\b([A-Z])\s+([a-z])/g, '$1$2') // "V alley" -> "Valley", "T own" -> "Town"
    .replace(/-\s+/g, '-') // "Broomehill- Tambellup" -> "Broomehill-Tambellup"
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanSuburb(s) {
  return cleanWordArtifacts(s)
    .replace(/(^|[^A-Z])([A-Z]) ([A-Z]{2,})/g, '$1$2$3') // "Y AKAMIA" -> "YAKAMIA"
    .replace(/(^|[^A-Z])([A-Z]) ([A-Z])(?=\s|$)/g, '$1$2$3'); // "NABA W A" -> "NABA WA"
}

function cleanText(s) {
  return s
    .replace(/\b([A-Z])\s+([a-z])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanNumber(s) {
  if (!s) return null;
  const n = parseFloat(s.replace(/[$,]/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cleanEmail(s) {
  return s.replace(/\s*\.\s*/g, '.').replace(/\s*@\s*/g, '@').trim();
}

function cleanWebsite(s) {
  let w = s.replace(/\s*\.\s*/g, '.').replace(/\s+/g, ' ').trim();
  if (!/^https?:\/\//i.test(w)) w = 'https://' + w;
  return w;
}

const COUNCIL_RE = /^(T own|Town|City|Shire) of (.+)$/;
const STAT_PAIRS = [
  [/Distance from Perth \(km\)\s+([\d,. ]+)/, 'distance_km', /Number of Electors\s+([\d,. ]+)/, 'electors'],
  [/Area \(sq km\)\s+([\d,. ]+)/, 'area_sqkm', /Number of Dwellings\s+([\d,. ]+)/, 'dwellings'],
  [/Length of Sealed Roads \(km\)\s+([\d,. ]+)/, 'sealed_roads_km', /T otal Rates Levied\s+\$([\d,. ]+)/, 'rates_levied'],
  [/Length of Unsealed Roads \(km\)\s+([\d,. ]+)/, 'unsealed_roads_km', /T otal Revenue\s+\$([\d,. ]+)/, 'revenue'],
  [/Population\s+([\d,. ]+)/, 'population', /Number of Employees\s+([\d,. ]+)/, 'employees']
];

function parseStats(lines) {
  const stats = {};
  for (const line of lines) {
    for (const [lRe, lKey, rRe, rKey] of STAT_PAIRS) {
      const lm = line.match(lRe);
      const rm = line.match(rRe);
      if (lm) stats[lKey] = cleanNumber(lm[1]);
      if (rm) stats[rKey] = cleanNumber(rm[1]);
    }
  }
  return stats;
}

function parseAddress(line) {
  const m = line.match(/^(.*?)(?:,\s*)?(?:W\s*A\s+)?(\d{4})\s*(?:Australia)?$/);
  if (!m) return { street: line, suburb: null, postcode: null };
  const before = cleanSuburb(m[1].trim());
  const suburbM = before.match(/^(.*?)\s+([A-Z][A-Z][A-Z ]*)$/);
  return {
    street: suburbM ? suburbM[1].trim() : before,
    suburb: suburbM ? cleanSuburb(suburbM[2].trim()) : null,
    postcode: m[2]
  };
}

export function tokenizeSuburbs(raw) {
  const cleaned = cleanSuburb(raw.replace(/&ndash;?/gi, '-').replace(/&amp;/g, '&').replace(/\s*\.\s*$/g, ''));
  const out = [];
  const seen = new Set();
  let pending = [];
  const flushPending = (postcode) => {
    for (const n of pending) push(n, postcode);
    pending = [];
  };
  const push = (name, postcode) => {
    const n = cleanText(name).replace(/[,.]+$/, '');
    if (!n) return;
    if (/^(Bordered|For the full list)/i.test(n)) return;
    const key = n + '|' + (postcode || '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: n, postcode });
  };
  for (const part of cleaned.split(';')) {
    let p = part.trim().replace(/,$/, '');
    if (!p) continue;
    let m = p.match(/^(.+?)\s*\((?:all|both)\s+(\d{4})\)/);
    if (m) {
      const names = m[1].replace(/[-–—]?\s*inhabited/gi, '').split(/\s*,\s*|\s+and\s+/);
      for (const n of names) push(n, m[2]);
      flushPending(m[2]);
      continue;
    }
    for (const chunk of p.split(/,(?!\s*\d{4}\b)/)) {
      let c = chunk.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      if (!c) continue;
      const cm = c.match(/^(.+?)(?:\s+)?(\d{4})\s*$/);
      if (cm) { push(cm[1], cm[2]); continue; }
      if (/^[A-Z]/.test(c)) pending.push(c);
    }
  }
  flushPending(null);
  return out;
}

function parseSuburbs(text) {
  return tokenizeSuburbs(text);
}

export function parseDirectoryText(text) {
  const lines = text.split('\n').map(l => l.trim());
  const start = lines.findIndex(l => l === 'Council Statistics 2024-25');
  const afterStart = start >= 0 ? lines.slice(start) : lines;
  const relEnd = afterStart.findIndex(l => l.includes('Suburbs & Localities Appendix'));
  const section = afterStart.slice(0, relEnd >= 0 ? relEnd : afterStart.length);

  const entries = [];
  let current = null;
  let statsLines = null;
  let mode = null; // 'stats' | 'entry' | 'post'
  let sectionName = null; // 'head' | 'deputy' | 'councillors' | 'exec' | 'ceo' | 'map' | 'suburbs' | 'meetings'
  let sectionLines = [];
  let councilWard = null;
  let expectCeo = false;

  const buffer = (raw) => { sectionLines.push(raw); };

  const HEADINGS = [
    [/^Map Coordinates\s*$/, 'map'],
    [/^Suburbs and Localities\s*$/, 'suburbs'],
    [/^Ordinary Council Meetings\s*$/, 'meetings'],
    [/^(?:Executive T eam|Executive Team)\s*$/, 'exec'],
    [/^Councillors\s*$/, 'councillors'],
    [/^Councilors\s*$/, 'councillors'],
    [/^Deputy (Mayor|President)\s*$/, 'deputy'],
    [/^(Lord )?(Mayor|President|Chairman|Chairperson)\s*$/, 'head']
  ];

  const startSection = (name) => {
    if (sectionName === 'suburbs' && current) current.suburbs = parseSuburbs(sectionLines.join(' '));
    else if (sectionName === 'meetings' && current) current.meeting_schedule = cleanWordArtifacts(sectionLines.join(' ')) || null;
    else if (sectionName === 'exec' && current) current.executive_team = cleanWordArtifacts(sectionLines.join(' ')) || null;
    sectionName = name;
    sectionLines = [];
  };

  const bufferOrStart = (raw) => {
    for (const [re, name] of HEADINGS) {
      if (re.test(raw)) { startSection(name); return true; }
    }
    buffer(raw);
    return false;
  };

  for (const raw of section) {
    if (raw === 'Council Statistics 2024-25') {
      if (current) {
        startSection(null);
        entries.push(current);
      }
      current = null;
      sectionName = null;
      sectionLines = [];
      statsLines = [];
      mode = 'stats';
      continue;
    }
    if (/^© W A Local Government Directory 2026/.test(raw)) continue;
    if (/^\d{1,3}$/.test(raw)) continue;
    if (!raw) continue;

    if (mode === 'stats') {
      const nameM = raw.match(COUNCIL_RE);
      if (nameM) {
        current = { ...parseStats(statsLines) };
        current.name = cleanWordArtifacts(raw);
        current.council_type = cleanWordArtifacts(nameM[1]).toLowerCase();
        current.short_name = cleanWordArtifacts(nameM[2]);
        mode = 'entry';
        continue;
      }
      statsLines.push(raw);
      continue;
    }
    if (mode === 'post') continue;
    if (!current) continue;

    // section content buffering
    if (sectionName === 'map') { current.map_coordinates = raw; sectionName = null; continue; }
    if (sectionName === 'head') { current.mayor = cleanWordArtifacts(raw).replace(/\s*\(\d{4}\)\s*$/, ''); sectionName = null; continue; }
    if (sectionName === 'deputy') { current.deputy = cleanWordArtifacts(raw).replace(/\s*\(\d{4}\)\s*$/, ''); sectionName = null; continue; }
    if (sectionName === 'ceo') { current.ceo = cleanWordArtifacts(raw); sectionName = 'exec'; continue; }
    if (sectionName === 'councillors') {
      if (bufferOrStart(raw)) continue;
      const wardM = raw.match(/^(.+?)\s*Ward$/);
      if (wardM && !raw.includes('(')) { councilWard = cleanWordArtifacts(wardM[1]); continue; }
      const termM = raw.match(/^(.+?)\s*\((\d{4})\)\s*$/);
      const name = cleanWordArtifacts(termM ? termM[1] : raw);
      if (name && !/^V acant|^Vacant/.test(name)) {
        current.councillors.push({ name, ward: councilWard || null, term: termM ? termM[2] : null });
      }
      continue;
    }
    if (sectionName === 'exec') {
      const inlineCeo = raw.match(/^(?:Acting )?Chief Executive Officer\s+(.+)$/);
      if (inlineCeo) { current.ceo = cleanWordArtifacts(inlineCeo[1]); continue; }
      if (/^(?:Acting )?Chief Executive Officer\s*$/.test(raw)) { sectionName = 'ceo'; continue; }
      if (bufferOrStart(raw)) continue;
      continue;
    }
    if (sectionName === 'suburbs') { bufferOrStart(raw); continue; }
    if (sectionName === 'meetings') { bufferOrStart(raw); continue; }

    // ward lines without a "Councillors" heading (e.g. City of Subiaco)
    const implicitWard = raw.match(/^(.+?)\s*Ward$/);
    if (implicitWard && !raw.includes('(')) {
      startSection('councillors');
      current.councillors = [];
      councilWard = cleanWordArtifacts(implicitWard[1]);
      continue;
    }

    // field detection
    const telEmail = raw.match(/^T\s*elephone\s+(.+?)\s+Email\s+(.+)$/);
    if (telEmail) { current.phone = telEmail[1].trim(); current.email = cleanEmail(telEmail[2]); continue; }
    if (/^T elephone/.test(raw)) { current.phone = raw.replace(/^T elephone\s*/, '').trim(); continue; }
    if (/^Telephone/.test(raw)) { current.phone = raw.replace(/^Telephone\s*/, '').trim(); continue; }
    if (/^Email/.test(raw)) { current.email = cleanEmail(raw.replace(/^Email\s*/, '')); continue; }
    if (/^www\b/.test(raw) || /^http/.test(raw)) { current.website = cleanWebsite(raw); continue; }
    if (/^ABN/.test(raw)) { current.abn = raw.replace(/^ABN\s*/, '').trim(); continue; }
    if (/^Band\s+\d/.test(raw)) { current.band = parseInt(raw.replace(/^Band\s*/, ''), 10); continue; }
    if (/^Map Coordinates/.test(raw)) { startSection('map'); continue; }
    if (/^Suburbs and Localities/.test(raw)) { startSection('suburbs'); continue; }
    if (/^Ordinary Council Meetings/.test(raw)) { startSection('meetings'); continue; }
    if (/^(?:Executive T eam|Executive Team)/.test(raw)) { startSection('exec'); continue; }
    if (/^Councillors/.test(raw)) { startSection('councillors'); current.councillors = []; councilWard = null; continue; }
    if (/^Deputy (Mayor|President)/.test(raw)) { startSection('deputy'); continue; }
    if (/^(?:Lord )?(Mayor|President|Chairman|Chairperson)$/.test(raw)) { startSection('head'); continue; }

    if (!current.address) {
      const a = parseAddress(raw);
      if (a.postcode) { current.address = a.street; current.suburb = a.suburb; current.postcode = a.postcode; continue; }
    }
  }
  if (sectionName === 'suburbs' && current) current.suburbs = parseSuburbs(sectionLines.join(' '));
  else if (sectionName === 'meetings' && current) current.meeting_schedule = sectionLines.join(' ').replace(/\s+/g, ' ').trim() || null;
  else if (sectionName === 'exec' && current) current.executive_team = sectionLines.join(' ').replace(/\s+/g, ' ').trim() || null;
  if (current) entries.push(current);

  return entries;
}

const JUNK_MEMBERS = /^(Metropolitan Zones|Country Zones|WA LGA|Tel:|As of|©|=== PAGE|WALGA)/;

function pushMembers(current, text, carry) {
  const parts = cleanWordArtifacts(text).split(',').map(s => cleanText(s)).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i];
    if (JUNK_MEMBERS.test(p)) continue;
    if (carry && p) { p = carry + p; carry = null; }
    if (p.endsWith('-')) { carry = p.slice(0, -1); continue; }
    if (p) current.members.push(p);
  }
  return carry;
}

export function extractZones(text) {
  const lines = text.split('\n').map(l => l.trim());
  const zones = [];
  let current = null;
  let carry = null;
  const zoneRe = /^(.+?Zone)\s*\((\d+)\)\s*$/;
  for (const raw of lines) {
    if (zoneRe.test(raw)) {
      carry = null;
      current = { zone: raw.match(zoneRe)[1], members: [] };
      zones.push(current);
      continue;
    }
    if (!current) continue;
    if (/^=== PAGE \d+ ===$/.test(raw) || /^© W A/.test(raw)) continue;
    if (/^Quick Reference|^Suburbs & Localities Appendix|^Regional Local Governments|^Maps of Local/.test(raw)) break;
    const membersM = raw.match(/^Members:\s*(.+)$/);
    if (membersM) {
      carry = pushMembers(current, membersM[1], carry);
      continue;
    }
    if (/^Executive Officer|^PO Box|^Tel:|^Email:|^Email\s|^W A LGA|^WALGA|^170 Railway|^WEST LEEDERVILLE|^Mobile|^Fax|^Ms |^Mr |^President|^Cr |^V acant/.test(raw)) continue;
    if (/^\d{4}$/.test(raw) || /^\d{1,3}$/.test(raw)) continue;
    if (current.members.length > 0 || carry) {
      carry = pushMembers(current, raw, carry);
    }
  }
  return zones;
}

export function assignZones(entries, zones) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fix = (s) => norm(s).replace(/narambeen/g, 'narembeen');
  const zoneMap = {};
  for (const z of zones) for (const m of z.members) zoneMap[fix(m)] = z.zone;
  for (const e of entries) {
    const key = fix(e.short_name);
    let zone = zoneMap[key] || null;
    if (!zone) {
      let best = null;
      for (const [member, z] of Object.entries(zoneMap)) {
        if (key.startsWith(member) && member.length >= 3 && (!best || member.length > best.member.length)) best = { member, zone: z };
      }
      zone = best ? best.zone : null;
    }
    e.zone = zone;
  }
  return entries;
}

export function parseAppendix(text) {
  // "City of Albany\nAlbany , Bakers Junction, (all 6330); Cheynes 6328; ...\n\nShire of X\n..."
  const lines = text.split('\n').map(l => l.trim());
  const dirStart = lines.findIndex(l => l === 'Council Statistics 2024-25');
  const start = lines.findIndex((l, i) => i > dirStart && l.includes('Suburbs & Localities Appendix'));
  const end = lines.findIndex((l, i) => i > start && l.includes('Regional Local Governments'));
  const section = lines.slice(start >= 0 ? start + 1 : 0, end >= 0 ? end : lines.length);
  const out = [];
  let current = null;
  let buf = [];
  const flush = () => {
    if (!current) return;
    out.push({ name: current, suburbs: tokenizeSuburbs(buf.join(' ')) });
    current = null;
    buf = [];
  };
  for (const raw of section) {
    const nameM = raw.match(COUNCIL_RE);
    if (nameM) { flush(); current = cleanWordArtifacts(raw); continue; }
    if (current) buf.push(raw);
  }
  flush();
  return out;
}

export function backfillSuburbs(entries, appendix) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = {};
  for (const a of appendix) map[norm(a.name)] = a.suburbs;
  for (const e of entries) {
    if (!e.suburbs || !e.suburbs.length) {
      const list = map[norm(e.name)];
      if (list && list.length) e.suburbs = list;
    }
  }
  return entries;
}

export function buildDirectory(text) {
  const zones = extractZones(text);
  let entries = parseDirectoryText(text);
  assignZones(entries, zones);
  backfillSuburbs(entries, parseAppendix(text));
  return entries;
}
