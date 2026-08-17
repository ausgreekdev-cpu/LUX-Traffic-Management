import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-kanban-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.PORT = '0';

const { default: app } = await import('../src/app.js');
const { detectStaleCards } = await import('../src/scheduler.js');
const db = (await import('../src/db.js')).default;

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server?.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

async function loginAs(role) {
  const creds = {
    developer: ['developer@lux.com.au', 'Demo123!'],
    manager: ['manager@lux.com.au', 'Demo123!'],
    staff: ['staff@lux.com.au', 'Demo123!'],
    client: ['client@lux.com.au', 'Demo123!']
  };
  const [email, password] = creds[role];
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(res.status, 200, `${role} login`);
  return (await res.json()).token;
}

function authed(token) { return { Authorization: `Bearer ${token}` }; }
function postHeaders(token) { return { ...authed(token), 'Content-Type': 'application/json' }; }

async function send(token, method, path, body) {
  return fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? authed(token) : postHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function createTmp(token, title = 'Kanban TMP') {
  const res = await send(token, 'POST', '/tmps', { title, plan_type: 'temporary', complexity: 'standard' });
  if (res.status !== 201) throw new Error(`create TMP failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function board(token, entityType = 'tmp') {
  const res = await send(token, 'GET', `/kanban/board?entity_type=${entityType}`);
  assert.equal(res.status, 200);
  return res.json();
}

async function columnId(token, entityType, name) {
  const res = await send(token, 'GET', `/kanban/columns?entity_type=${entityType}`);
  const cols = await res.json();
  const col = cols.find(c => c.name === name);
  assert.ok(col, `column ${name} exists`);
  return col.id;
}

async function tickAllStages(token, entityType, entityId) {
  const res = await send(token, 'GET', `/workflows/checklist/${entityType}/${entityId}`);
  const { data } = await res.json();
  for (const stage of data) {
    await send(token, 'POST', `/workflows/checklist/${entityType}/${entityId}`, { stageId: stage.id, done: true });
  }
}

test('kanban: default columns seeded for tmp and permit boards', async () => {
  const manager = await loginAs('manager');
  for (const entityType of ['tmp', 'permit']) {
    const res = await send(manager, 'GET', `/kanban/columns?entity_type=${entityType}`);
    assert.equal(res.status, 200);
    const cols = await res.json();
    assert.ok(cols.length >= 5, `${entityType} board has seeded columns`);
    assert.ok(cols.some(c => c.maps_to_status === 'draft'), `${entityType} maps to draft`);
    assert.ok(cols.some(c => c.is_final === 1), `${entityType} has a final column`);
  }
});

test('kanban: board GET backfills existing TMPs as cards', async () => {
  const staff = await loginAs('staff');
  const { id } = await createTmp(staff, 'Backfill Target');
  const body = await board(staff, 'tmp');
  const card = body.cards.find(c => c.entity_id === id);
  assert.ok(card, 'created TMP appears as a card');
  assert.ok(card.title.includes('Backfill Target'));
  assert.ok(body.columns.every(c => typeof c.count === 'number'));
  assert.ok(Array.isArray(body.lanes));
  assert.ok(Array.isArray(body.users));
});

test('kanban: column config is manager-only', async () => {
  const staff = await loginAs('staff');
  const manager = await loginAs('manager');
  const staffRes = await send(staff, 'POST', '/kanban/columns', { entity_type: 'tmp', name: 'Blocked' });
  assert.equal(staffRes.status, 403);

  const mgrRes = await send(manager, 'POST', '/kanban/columns', { entity_type: 'tmp', name: 'Test Column' });
  assert.equal(mgrRes.status, 201);
  const created = await mgrRes.json();

  const reorder = await send(manager, 'POST', '/kanban/columns/reorder', { entity_type: 'tmp', ids: [created.id] });
  assert.equal(reorder.status, 200);

  const del = await send(manager, 'DELETE', `/kanban/columns/${created.id}`, { force: true });
  assert.equal(del.status, 200);
});

test('kanban: DoD checklist gate blocks moving into Safety Audit until stages complete', async () => {
  const staff = await loginAs('staff');
  const { id } = await createTmp(staff, 'DoD Gated TMP');
  const safetyCol = await columnId(staff, 'tmp', 'Safety Audit');

  const blocked = await send(staff, 'PUT', `/kanban/cards/tmp/${id}`, { column_id: safetyCol });
  assert.equal(blocked.status, 409, 'move blocked by Definition of Done');
  const blockedBody = await blocked.json();
  assert.ok(blockedBody.missing.length > 0, 'lists missing stages');
  assert.ok(blockedBody.missing.some(m => /TMP drawing|Internal review|Client sign-off/.test(m)));

  const forced = await send(staff, 'PUT', `/kanban/cards/tmp/${id}`, { column_id: safetyCol, force: true });
  assert.equal(forced.status, 200, 'force bypasses the gate');
});

test('kanban: move updates entity status, auto-assigns role, writes history', async () => {
  const staff = await loginAs('staff');
  const { id } = await createTmp(staff, 'Move Target');
  await tickAllStages(staff, 'tmp', id);

  const safetyCol = await columnId(staff, 'tmp', 'Safety Audit');
  const moved = await send(staff, 'PUT', `/kanban/cards/tmp/${id}`, { column_id: safetyCol });
  assert.equal(moved.status, 200);
  const movedBody = await moved.json();
  assert.equal(movedBody.status, 'submitted', 'status synced via maps_to_status');
  assert.ok(movedBody.assigned_user_id, 'auto-assigned to a staff user');
  assert.equal(movedBody.lane, '');

  const councilCol = await columnId(staff, 'tmp', 'Council Pending Approval');
  const second = await send(staff, 'PUT', `/kanban/cards/tmp/${id}`, { column_id: councilCol });
  assert.equal(second.status, 200);

  const card = db.prepare('SELECT * FROM board_cards WHERE entity_type = ? AND entity_id = ?').get('tmp', id);
  const history = db.prepare('SELECT * FROM board_card_history WHERE card_id = ? ORDER BY entered_at').all(card.id);
  assert.ok(history.length >= 3, 'history tracks every move');

  const body = await board(staff, 'tmp');
  const view = body.cards.find(c => c.entity_id === id);
  assert.equal(view.column_id, councilCol);
  assert.equal(view.checklist_total, 3, 'applicable stages surfaced');
  assert.equal(view.checklist_done, 3);
});

test('kanban: WIP limit blocks moves beyond column cap', async () => {
  const staff = await loginAs('staff');
  const manager = await loginAs('manager');
  const draftingCol = await columnId(staff, 'tmp', 'Drafting');

  await send(manager, 'PUT', `/kanban/columns/${draftingCol}`, { wip_limit: 1, enforce_wip: true });

  const a = await createTmp(staff, 'WIP A');
  const b = await createTmp(staff, 'WIP B');

  const first = await send(staff, 'PUT', `/kanban/cards/tmp/${a.id}`, { column_id: draftingCol });
  assert.equal(first.status, 200, 'first card fits under WIP limit');

  const second = await send(staff, 'PUT', `/kanban/cards/tmp/${b.id}`, { column_id: draftingCol });
  assert.equal(second.status, 409, 'second card hits the WIP limit');
  const body = await second.json();
  assert.ok(/WIP limit/.test(body.error));
});

test('kanban: emergency lane bypasses DoD and WIP gates', async () => {
  const staff = await loginAs('staff');
  const { id } = await createTmp(staff, 'Emergency Card');
  const councilCol = await columnId(staff, 'tmp', 'Council Pending Approval');

  const moved = await send(staff, 'PUT', `/kanban/cards/tmp/${id}`, { column_id: councilCol, lane: 'emergency' });
  assert.equal(moved.status, 200, 'emergency fast-track skips the DoD gate');
  const body = await moved.json();
  assert.equal(body.lane, 'emergency');

  const boardBody = await board(staff, 'tmp');
  const view = boardBody.cards.find(c => c.entity_id === id);
  assert.equal(view.lane, 'emergency');
  assert.ok(boardBody.lanes[0] === 'emergency', 'emergency lane is pinned first');
});

test('kanban: analytics returns CFD, lead/cycle time and time-in-column', async () => {
  const staff = await loginAs('staff');
  const res = await send(staff, 'GET', '/kanban/analytics?entity_type=tmp&days=14');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.cfd.length, 14, 'CFD spans requested window');
  assert.ok(body.cfd.every(d => typeof d.total === 'number'));
  assert.ok(body.columns.length > 0);
  assert.ok('avg_days' in body.lead_time && 'sample_count' in body.lead_time);
  assert.ok('avg_days' in body.cycle_time);
  assert.ok(Array.isArray(body.time_in_column) && body.time_in_column.length === body.columns.length);
});

test('kanban: permit board backfills and moves', async () => {
  const staff = await loginAs('staff');
  const { id: tmpId } = await createTmp(staff, 'Permit Source TMP');

  const authRes = await send(staff, 'POST', '/authorities', { name: 'Kanban Test Council', short_name: 'KTC' });
  assert.equal(authRes.status, 201);
  const authority = await authRes.json();

  const permRes = await send(staff, 'POST', '/permits', { tmp_id: tmpId, authority_id: authority.id });
  assert.equal(permRes.status, 201);
  const { id } = await permRes.json();

  const body = await board(staff, 'permit');
  const card = body.cards.find(c => c.entity_id === id);
  assert.ok(card, 'permit appears on permit board');
  assert.equal(card.lane, 'KTC', 'permit lanes group by authority');

  const underReview = await columnId(staff, 'permit', 'Under Review');
  const moved = await send(staff, 'PUT', `/kanban/cards/permit/${id}`, { column_id: underReview });
  assert.equal(moved.status, 200);
  assert.equal((await moved.json()).status, 'under_review');
});

test('kanban: stale-card detection flags and dedupes old cards', async () => {
  const staff = await loginAs('staff');
  const { id } = await createTmp(staff, 'Stale Target');
  const councilCol = await columnId(staff, 'tmp', 'Council Pending Approval');
  await tickAllStages(staff, 'tmp', id);
  await send(staff, 'PUT', `/kanban/cards/tmp/${id}`, { column_id: councilCol });

  db.prepare("UPDATE board_cards SET entered_column_at = ? WHERE entity_type = 'tmp' AND entity_id = ?").run(new Date(Date.now() - 12 * 86400000).toISOString(), id);

  const alerted = detectStaleCards();
  assert.ok(alerted >= 1, 'stale card detected');

  const card = db.prepare("SELECT last_stale_alert_at FROM board_cards WHERE entity_type = 'tmp' AND entity_id = ?").get(id);
  assert.ok(card.last_stale_alert_at, 'stale alert timestamp recorded');

  const firstStamp = card.last_stale_alert_at;
  detectStaleCards();
  const after = db.prepare("SELECT last_stale_alert_at FROM board_cards WHERE entity_type = 'tmp' AND entity_id = ?").get(id);
  assert.equal(after.last_stale_alert_at, firstStamp, 'not re-alerted within the same day');
});