import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-photos-test-'));
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

function authed(token) { return { Authorization: `Bearer ${token}` }; }

function tinyJpeg() {
  return new Uint8Array([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
  ]);
}

async function makeTmp(staff, title) {
  const res = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title || 'Photo Test TMP', plan_type: 'temporary' })
  });
  assert.equal(res.status, 201);
  return (await res.json()).id;
}

test('photos: upload requires staff; image bytes accepted; round-trip + delete', async () => {
  const staff = await loginAs('staff');
  const client = await loginAs('client');
  const manager = await loginAs('manager');
  const tmpId = await makeTmp(staff, 'Photo Round-Trip TMP');

  const clientUp = await fetch(`${base}/photos`, {
    method: 'POST',
    headers: authed(client),
    body: (() => {
      const fd = new FormData();
      fd.append('file', new Blob([tinyJpeg()], { type: 'image/jpeg' }), 'site.jpg');
      fd.append('meta', JSON.stringify({ tmp_id: tmpId, caption: 'nope' }));
      return fd;
    })()
  });
  assert.equal(clientUp.status, 403, 'client cannot upload');

  const badType = await fetch(`${base}/photos`, {
    method: 'POST',
    headers: authed(staff),
    body: (() => {
      const fd = new FormData();
      fd.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'evil.txt');
      fd.append('meta', JSON.stringify({ tmp_id: tmpId }));
      return fd;
    })()
  });
  assert.equal(badType.status, 400, 'non-image rejected');

  const up = await fetch(`${base}/photos`, {
    method: 'POST',
    headers: authed(staff),
    body: (() => {
      const fd = new FormData();
      fd.append('file', new Blob([tinyJpeg()], { type: 'image/jpeg' }), 'site.jpg');
      fd.append('meta', JSON.stringify({ tmp_id: tmpId, latitude: -31.95, longitude: 115.85, caption: 'Approach view', watermark_on: true }));
      return fd;
    })()
  });
  assert.equal(up.status, 201);
  const { id } = await up.json();

  const listed = await fetch(`${base}/photos/tmps/${tmpId}`, { headers: authed(staff) });
  assert.equal(listed.status, 200);
  const photos = await listed.json();
  assert.ok(Array.isArray(photos) && photos.length === 1);
  assert.equal(photos[0].caption, 'Approach view');
  assert.equal(photos[0].latitude, -31.95);
  assert.equal(photos[0].uploaded_by_name, 'Staff User');

  const got = await fetch(`${base}/photos/${id}`, { headers: authed(staff) });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/jpeg');

  const clientList = await fetch(`${base}/photos/tmps/${tmpId}`, { headers: authed(client) });
  assert.equal(clientList.status, 403, 'client blocked from unowned TMP photos');

  const del = await fetch(`${base}/photos/${id}`, { method: 'DELETE', headers: authed(manager) });
  assert.equal(del.status, 200);

  const gone = await fetch(`${base}/photos/${id}`, { headers: authed(staff) });
  assert.equal(gone.status, 404);
});

test('photos: TMP detail includes photos array and site speed fields', async () => {
  const staff = await loginAs('staff');
  const siteRes = await fetch(`${base}/sites`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Georges Terrace', road_name: 'St Georges Terrace', suburb: 'Perth', road_class: 'arterial', speed_limit: 60, aadt: 45000 })
  });
  assert.equal(siteRes.status, 201);
  const { id: siteId } = await siteRes.json();

  const tmpRes = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Speed Zone TMP', plan_type: 'temporary', site_id: siteId })
  });
  const tmpId = (await tmpRes.json()).id;

  const up = await fetch(`${base}/photos`, {
    method: 'POST',
    headers: authed(staff),
    body: (() => {
      const fd = new FormData();
      fd.append('file', new Blob([tinyJpeg()], { type: 'image/jpeg' }), 'site.jpg');
      fd.append('meta', JSON.stringify({ tmp_id: tmpId, caption: 'Worksite' }));
      return fd;
    })()
  });
  assert.equal(up.status, 201);

  const detail = await fetch(`${base}/tmps/${tmpId}`, { headers: authed(staff) });
  assert.equal(detail.status, 200);
  const body = await detail.json();
  assert.equal(body.speed_limit, 60, 'speed limit surfaced on TMP detail');
  assert.equal(body.road_class, 'arterial');
  assert.equal(body.aadt, 45000);
  assert.ok(Array.isArray(body.photos) && body.photos.length === 1, 'photos surfaced on TMP detail');
});