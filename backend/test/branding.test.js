import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-branding-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.BRANDING_ASSETS_DIR = path.join(tmpDir, 'assets');
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

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// Undici's fetch forbids overriding the Host header, so use node:http directly.
function getWithHost(host, apiPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: server.address().port, path: `/api${apiPath}`,
      headers: { Host: host }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('branding: public summary is reachable without auth and carries default vars', async () => {
  const res = await fetch(`${base}/branding`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.appName, 'LUX Traffic Management');
  assert.ok(body.cssVars['--lux-500'], 'has --lux-500 ramp variable');
  assert.equal(body.themeColor, '#f57f17');
});

test('branding: full state is developer-only', async () => {
  const noAuth = await fetch(`${base}/branding/full`);
  assert.equal(noAuth.status, 401);

  const manager = await loginAs('manager');
  const denied = await send(manager, 'GET', '/branding/full');
  assert.equal(denied.status, 403);

  const dev = await loginAs('developer');
  const ok = await send(dev, 'GET', '/branding/full');
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.theme.primary, '#f57f17');
  assert.ok(Array.isArray(body.assets));
  assert.ok(Array.isArray(body.versions));
  assert.ok(Array.isArray(body.domains));
});

test('branding: theme save recomputes ramp and summary, snapshots a version', async () => {
  const dev = await loginAs('developer');
  const res = await send(dev, 'PUT', '/branding', { theme: { primary: '#123456', secondary: '#00ff88' } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.css_version >= 1);

  const pub = await fetch(`${base}/branding`).then(r => r.json());
  assert.equal(pub.themeColor, '#123456');
  assert.ok(pub.cssVars['--brand-primary-contrast'], 'contrast token computed');

  const full = await (await send(dev, 'GET', '/branding/full')).json();
  assert.equal(full.theme.primary, '#123456');
  assert.equal(full.versions.length, 1, 'previous state snapshotted');
});

test('branding: asset upload + public download round-trip', async () => {
  const dev = await loginAs('developer');
  const form = new FormData();
  form.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'logo.png');
  const up = await fetch(`${base}/branding/assets/logo_light`, {
    method: 'POST',
    headers: authed(dev),
    body: form
  });
  assert.equal(up.status, 200);
  const upBody = await up.json();
  assert.equal(upBody.slot, 'logo_light');

  const pub = await fetch(`${base}/branding`).then(r => r.json());
  assert.equal(pub.assets.logoLight, '/api/branding/assets/logo_light');

  const get = await fetch(`${base}/branding/assets/logo_light`);
  assert.equal(get.status, 200);
  assert.match(get.headers.get('content-type'), /image\/png/);
  const bytes = Buffer.from(await get.arrayBuffer());
  assert.equal(bytes.length, PNG_1PX.length);

  const badType = new FormData();
  badType.append('file', new Blob([Buffer.from('nope')], { type: 'application/pdf' }), 'doc.pdf');
  const reject = await fetch(`${base}/branding/assets/logo_light`, { method: 'POST', headers: authed(dev), body: badType });
  assert.equal(reject.status, 400, 'invalid type rejected');

  const del = await send(dev, 'DELETE', '/branding/assets/logo_light');
  assert.equal(del.status, 200);
  const gone = await fetch(`${base}/branding/assets/logo_light`);
  assert.equal(gone.status, 404);
});

test('branding: preview endpoint returns CSS + contrast audit', async () => {
  const dev = await loginAs('developer');
  const res = await send(dev, 'POST', '/branding/preview', { theme: { primary: '#ffffff' }, css_override: 'body { color: red; }' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.css, /--lux-500/);
  assert.match(body.css, /body \{ color: red; \}/);
  assert.ok(body.audit.length >= 4);
  const whitePrimary = body.audit.find(a => a.label === 'Primary');
  assert.equal(whitePrimary.white, 1, 'white-on-white has ratio 1');
});

test('branding: watermark defaults and css override validation', async () => {
  const dev = await loginAs('developer');
  const res = await send(dev, 'PUT', '/branding', { watermark: { mode: 'status', fontSize: 40 }, css_override: 'a { color: var(--brand-accent); }' });
  assert.equal(res.status, 200);

  const full = await (await send(dev, 'GET', '/branding/full')).json();
  assert.equal(full.watermark.mode, 'status');
  assert.equal(full.watermark.fontSize, 40);
  assert.match(full.css_override, /brand-accent/);
  assert.equal(full.watermark.status_text.approved, 'APPROVED', 'status watermark map preserved');
});

test('branding: reset restores defaults', async () => {
  const dev = await loginAs('developer');
  await send(dev, 'PUT', '/branding', { theme: { primary: '#ff00aa' } });
  const reset = await send(dev, 'POST', '/branding/reset');
  assert.equal(reset.status, 200);

  const pub = await fetch(`${base}/branding`).then(r => r.json());
  assert.equal(pub.themeColor, '#f57f17');
});

test('branding: domain mapping CRUD', async () => {
  const dev = await loginAs('developer');
  const create = await send(dev, 'POST', '/branding/domain', { domain: 'traffic.citycouncil.gov.au' });
  assert.equal(create.status, 201);

  const dup = await send(dev, 'POST', '/branding/domain', { domain: 'traffic.citycouncil.gov.au' });
  assert.equal(dup.status, 409);

  const bad = await send(dev, 'POST', '/branding/domain', { domain: 'not a domain' });
  assert.equal(bad.status, 400);

  const list = await (await send(dev, 'GET', '/branding/domain')).json();
  assert.equal(list.domains.length, 1);

  const del = await send(dev, 'DELETE', `/branding/domain/${list.domains[0].id}`);
  assert.equal(del.status, 200);
});

test('branding: version restore rolls back a saved theme', async () => {
  const dev = await loginAs('developer');
  const before = (await fetch(`${base}/branding`).then(r => r.json())).themeColor;
  await send(dev, 'PUT', '/branding', { theme: { primary: '#111111' } });
  const versions = (await (await send(dev, 'GET', '/branding/full')).json()).versions;
  assert.ok(versions.length >= 2, 'edit snapshots the previous state');

  const restore = await send(dev, 'POST', `/branding/versions/${versions[0].id}/restore`);
  assert.equal(restore.status, 200);

  const pub = await fetch(`${base}/branding`).then(r => r.json());
  assert.equal(pub.themeColor, before);
});

test('branding: bad theme input rejected', async () => {
  const dev = await loginAs('developer');
  const res = await send(dev, 'PUT', '/branding', { theme: 'not-an-object' });
  assert.equal(res.status, 400);
  const badColour = await send(dev, 'PUT', '/branding', { theme: { primary: 'zzz' } });
  assert.equal(badColour.status, 200, 'invalid colour falls back to default rather than erroring');
});

test('branding: per-domain brand — save, host resolution, scoped versions', async () => {
  const dev = await loginAs('developer');
  const domain = 'traffic.citycouncil.gov.au';

  const save = await send(dev, 'PUT', `/branding?domain=${encodeURIComponent(domain)}`, { theme: { primary: '#123123' } });
  assert.equal(save.status, 200);
  await send(dev, 'PUT', `/branding?domain=${encodeURIComponent(domain)}`, { theme: { primary: '#123456' } });

  const viaHost = await getWithHost(domain, '/branding');
  assert.equal(viaHost.status, 200);
  assert.equal(viaHost.body.themeColor, '#123456', 'host header resolves the domain brand');

  const viaParam = await fetch(`${base}/branding?domain=${encodeURIComponent(domain)}`).then(r => r.json());
  assert.equal(viaParam.themeColor, '#123456', '?domain= resolves the domain brand');

  const global = await fetch(`${base}/branding`).then(r => r.json());
  assert.notEqual(global.themeColor, '#123456', 'default host still gets the global brand');

  const full = await (await send(dev, 'GET', `/branding/full?domain=${encodeURIComponent(domain)}`)).json();
  assert.equal(full.theme.primary, '#123456');
  assert.ok(full.versions.length >= 1, 'domain brand snapshots its own previous state');

  const restored = await send(dev, 'POST', `/branding/versions/${full.versions[0].id}/restore`);
  assert.equal(restored.status, 200);
  const after = await fetch(`${base}/branding?domain=${encodeURIComponent(domain)}`).then(r => r.json());
  assert.equal(after.themeColor, '#123123', 'restoring a domain version rolls back that domain only');
});

test('branding: per-domain assets resolve first, then fall back to global', async () => {
  const dev = await loginAs('developer');
  const domain = 'traffic.citycouncil.gov.au';

  const gForm = new FormData();
  gForm.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'g.png');
  const up = await fetch(`${base}/branding/assets/logo_light`, { method: 'POST', headers: authed(dev), body: gForm });
  assert.equal(up.status, 200);

  const pub = await fetch(`${base}/branding?domain=${encodeURIComponent(domain)}`).then(r => r.json());
  assert.equal(pub.assets.logoLight, '/api/branding/assets/logo_light', 'domain without an asset falls back to the global URL');

  const dForm = new FormData();
  dForm.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'd.png');
  const dup = await fetch(`${base}/branding/assets/logo_light?domain=${encodeURIComponent(domain)}`, { method: 'POST', headers: authed(dev), body: dForm });
  assert.equal(dup.status, 200);

  const pub2 = await fetch(`${base}/branding?domain=${encodeURIComponent(domain)}`).then(r => r.json());
  assert.equal(pub2.assets.logoLight, `/api/branding/assets/logo_light?domain=${encodeURIComponent(domain)}`, 'domain asset URL carries ?domain=');

  const dGet = await fetch(`${base}/branding/assets/logo_light?domain=${encodeURIComponent(domain)}`);
  const gGet = await fetch(`${base}/branding/assets/logo_light`);
  assert.equal(dGet.status, 200);
  assert.equal(gGet.status, 200);
  assert.equal(Buffer.from(await dGet.arrayBuffer()).length, PNG_1PX.length);
  assert.equal(Buffer.from(await gGet.arrayBuffer()).length, PNG_1PX.length);

  await send(dev, 'DELETE', `/branding/assets/logo_light?domain=${encodeURIComponent(domain)}`);
  const pub3 = await fetch(`${base}/branding?domain=${encodeURIComponent(domain)}`).then(r => r.json());
  assert.equal(pub3.assets.logoLight, '/api/branding/assets/logo_light', 'deleting the domain asset restores global fallback');

  const gDel = await send(dev, 'DELETE', '/branding/assets/logo_light');
  assert.equal(gDel.status, 200);
});
