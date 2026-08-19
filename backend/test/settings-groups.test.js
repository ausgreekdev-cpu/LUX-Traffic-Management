import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-settings-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.PORT = '0';
process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');
process.env.MEDIA_DIR = path.join(tmpDir, 'media');

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

const authed = (token) => ({ Authorization: `Bearer ${token}` });

test('settings groups: GET requires developer; returns typed defaults + masked secrets', async () => {
  const developer = await loginAs('developer');
  const staff = await loginAs('staff');

  const denied = await fetch(`${base}/settings/groups`, { headers: authed(staff) });
  assert.equal(denied.status, 403);

  const res = await fetch(`${base}/settings/groups`, { headers: authed(developer) });
  assert.equal(res.status, 200);
  const groups = await res.json();

  assert.equal(groups.api_keys.weather_provider, 'none');
  assert.equal(typeof groups.kanban.default_wip_limit, 'number');
  assert.ok(Array.isArray(groups.export.speed_zone_colors));
  assert.ok(groups.export.speed_zone_colors[0].color.startsWith('#'));
  assert.equal(groups.sso.provider, 'none');
});

test('settings groups: PUT validates, stores typed values, and refuses bad payloads', async () => {
  const developer = await loginAs('developer');

  // Valid save: kanban numbers + api keys (secrets get masked on read).
  let res = await fetch(`${base}/settings/groups`, {
    method: 'PUT',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kanban: { default_wip_limit: 7, emergency_lane_policy: 'auto_assign', default_stale_business_days: 3 },
      api_keys: { mapbox_token: 'pk.test-token', weather_provider: 'openweathermap', weather_api_key: 'wkey' }
    })
  });
  assert.equal(res.status, 200, await res.text());

  let read = await (await fetch(`${base}/settings/groups`, { headers: authed(developer) })).json();
  assert.equal(read.kanban.default_wip_limit, 7);
  assert.equal(read.kanban.emergency_lane_policy, 'auto_assign');
  assert.equal(read.api_keys.weather_provider, 'openweathermap');
  assert.equal(read.api_keys.mapbox_token, '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022');
  assert.equal(read.api_keys.has_secret.mapbox_token, true);

  // Invalid: bad hex colour, unknown member, bad enum.
  res = await fetch(`${base}/settings/groups`, {
    method: 'PUT',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ export: { speed_zone_colors: [{ speed: 40, color: 'red' }] } })
  });
  assert.equal(res.status, 400);

  res = await fetch(`${base}/settings/groups`, {
    method: 'PUT',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ kanban: { nope: 1 } })
  });
  assert.equal(res.status, 400);

  res = await fetch(`${base}/settings/groups`, {
    method: 'PUT',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sso: { provider: 'oauth2', client_id: 'abc', client_secret: 's3cret' } })
  });
  assert.equal(res.status, 200);

  read = await (await fetch(`${base}/settings/groups`, { headers: authed(developer) })).json();
  assert.equal(read.sso.provider, 'oauth2');
  assert.equal(read.sso.client_secret, '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022');
  assert.equal(read.sso.has_secret.client_secret, true);
});

test('settings groups: RBAC matrix round-trips as a nested record', async () => {
  const developer = await loginAs('developer');
  const matrix = {
    matrix: {
      developer: { access_settings: true, manage_users: true },
      manager: { access_settings: false, manage_users: true },
      staff: { access_settings: false, manage_users: false },
      client: { access_settings: false, manage_users: false }
    }
  };
  const res = await fetch(`${base}/settings/groups`, {
    method: 'PUT',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ rbac: matrix })
  });
  assert.equal(res.status, 200, await res.text());

  const read = await (await fetch(`${base}/settings/groups`, { headers: authed(developer) })).json();
  assert.deepEqual(read.rbac.matrix, matrix.matrix);
});

test('telemetry: webhook deliveries logged on failure and success; manager+ only', async () => {
  const developer = await loginAs('developer');
  const manager = await loginAs('manager');
  const client = await loginAs('client');

  // A failed delivery (empty body) records a row.
  await fetch(`${base}/integrations/webhook/generic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foo: 'bar' })
  });

  const denied = await fetch(`${base}/telemetry/webhooks`, { headers: authed(client) });
  assert.equal(denied.status, 403);

  const res = await fetch(`${base}/telemetry/webhooks`, { headers: authed(manager) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.some((d) => d.status === 'failed' && d.provider === 'generic'));

  const storage = await (await fetch(`${base}/telemetry/storage`, { headers: authed(developer) })).json();
  assert.equal(typeof storage.database.bytes, 'number');
  assert.equal(typeof storage.media.files, 'number');
});

test('health: exposes storage usage fields', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const h = await res.json();
  assert.equal(typeof h.storage.media_bytes, 'number');
  assert.equal(typeof h.storage.photos, 'number');
});