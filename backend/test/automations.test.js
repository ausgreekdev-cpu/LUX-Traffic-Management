import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-auto-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.PORT = '0';

const { default: app } = await import('../src/app.js');

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
    staff: ['staff@lux.com.au', 'Demo123!']
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

test('automation rule CRUD', async () => {
  const developer = await loginAs('developer');
  const body = {
    name: 'Test Rule',
    entity_type: 'tmp',
    event_type: 'tmp.created',
    conditions: [{ field: 'status', op: 'eq', value: 'draft' }],
    actions: [{ type: 'notify', role: 'manager', message: 'New TMP created' }],
    is_active: true
  };

  const created = await fetch(`${base}/automations/rules`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const listed = await fetch(`${base}/automations/rules`, { headers: authed(developer) });
  assert.equal(listed.status, 200);
  const listBody = await listed.json();
  assert.ok(listBody.data.some((r) => r.id === id));

  const got = await fetch(`${base}/automations/rules/${id}`, { headers: authed(developer) });
  const rule = await got.json();
  assert.deepEqual(rule.conditions, body.conditions);

  const updated = await fetch(`${base}/automations/rules/${id}`, {
    method: 'PUT',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, name: 'Renamed Rule' })
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).name, 'Renamed Rule');

  const bad = await fetch(`${base}/automations/rules`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'No Action Rule', entity_type: 'tmp', event_type: 'tmp.created', conditions: [], actions: [] })
  });
  assert.equal(bad.status, 400, 'rule without actions is rejected');

  const del = await fetch(`${base}/automations/rules/${id}`, { method: 'DELETE', headers: authed(developer) });
  assert.equal(del.status, 200);
});

test('automation rule test-run evaluates against a TMP', async () => {
  const developer = await loginAs('developer');
  const staff = await loginAs('staff');
  const tmp = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Automation Target', plan_type: 'temporary' })
  });
  const { id: tmpId } = await tmp.json();

  const rule = await fetch(`${base}/automations/rules`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Draft Notify',
      entity_type: 'tmp',
      event_type: 'tmp.status_changed',
      conditions: [{ field: 'status', op: 'eq', value: 'draft' }],
      actions: [{ type: 'notify', role: 'manager', message: 'Draft alert' }],
      is_active: true
    })
  });
  const { id: ruleId } = await rule.json();

  const run = await fetch(`${base}/automations/rules/${ruleId}/test`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: 'tmp', entity_id: tmpId })
  });
  assert.equal(run.status, 200);
  const result = await run.json();
  assert.ok(result, 'test-run returns a result object');
});

test('automation presets are installed and listed', async () => {
  const developer = await loginAs('developer');
  const presets = await fetch(`${base}/automations/presets`, { headers: authed(developer) });
  assert.equal(presets.status, 200);
  const body = await presets.json();
  assert.ok(Array.isArray(body.data) && body.data.length >= 1, 'presets exist');
});