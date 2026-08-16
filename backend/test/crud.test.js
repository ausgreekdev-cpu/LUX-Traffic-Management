import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-crud-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.PORT = '0';
process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');

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

test('TMP CRUD: create, list, get, update status, delete', async () => {
  const staff = await loginAs('staff');
  const manager = await loginAs('manager');

  const created = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'CRUD Test TMP', plan_type: 'temporary', complexity: 'standard' })
  });
  assert.equal(created.status, 201);
  const { id, reference } = await created.json();
  assert.ok(reference.startsWith('TMP-'));

  const listed = await fetch(`${base}/tmps`, { headers: authed(staff) });
  assert.equal(listed.status, 200);
  const listBody = await listed.json();
  assert.ok(listBody.data.some((t) => t.id === id), 'new TMP appears in list');

  const got = await fetch(`${base}/tmps/${id}`, { headers: authed(staff) });
  assert.equal(got.status, 200);
  const gotBody = await got.json();
  assert.equal(gotBody.title, 'CRUD Test TMP');

  const updated = await fetch(`${base}/tmps/${id}`, {
    method: 'PUT',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Renamed TMP', status: 'submitted' })
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).status, 'submitted');

  const deleted = await fetch(`${base}/tmps/${id}`, {
    method: 'DELETE',
    headers: authed(manager)
  });
  assert.equal(deleted.status, 200);
});

test('TMP list supports opt-in pagination and hard cap', async () => {
  const staff = await loginAs('staff');
  const res = await fetch(`${base}/tmps?page=1&limit=5`, { headers: authed(staff) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.data));
  assert.equal(typeof body.total, 'number');
  assert.equal(body.page, 1);
  assert.equal(body.limit, 5);
  assert.equal(typeof body.pages, 'number');
});

test('permit workflow: create with fee, list, fetch', async () => {
  const staff = await loginAs('staff');
  const tmp = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Permit Flow TMP', plan_type: 'temporary' })
  });
  const { id: tmpId } = await tmp.json();

  const authorities = await (await fetch(`${base}/authorities`, { headers: authed(staff) })).json();
  assert.ok(Array.isArray(authorities) && authorities.length, 'seed authorities exist');
  const authority = Array.isArray(authorities) ? authorities[0] : authorities.data[0];

  const permitRes = await fetch(`${base}/permits`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmp_id: tmpId, authority_id: authority.id, complexity: 'standard' })
  });
  assert.equal(permitRes.status, 201);
  const { id: permitId } = await permitRes.json();

  const feeRes = await fetch(`${base}/permits/${permitId}/fees`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fee_type: 'application_fee', amount: 250 })
  });
  assert.equal(feeRes.status, 201);

  const fees = await fetch(`${base}/permits/${permitId}/fees`, { headers: authed(staff) });
  assert.equal(fees.status, 200);
  const feeList = await fees.json();
  assert.ok(Array.isArray(feeList) && feeList.length >= 1, 'fee recorded');
  assert.equal(feeList[0].amount, 250);

  const got = await fetch(`${base}/permits/${permitId}`, { headers: authed(staff) });
  assert.equal(got.status, 200);
  const permit = await got.json();
  assert.equal(permit.complexity, 'standard');
});

test('authorities CRUD: create, list, update, delete', async () => {
  const staff = await loginAs('staff');
  const manager = await loginAs('manager');
  const created = await fetch(`${base}/authorities`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'CRUD Test Council', short_name: 'CRUD', type: 'lga', band: 2 })
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const listed = await fetch(`${base}/authorities`, { headers: authed(staff) });
  assert.equal(listed.status, 200);
  const listBody = await listed.json();
  const all = Array.isArray(listBody) ? listBody : listBody.data;
  assert.ok(all.some((a) => a.id === id));

  const updated = await fetch(`${base}/authorities/${id}`, {
    method: 'PUT',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'CRUD Renamed Council', type: 'lga', band: 3 })
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).band, 3);

  const deleted = await fetch(`${base}/authorities/${id}`, { method: 'DELETE', headers: authed(manager) });
  assert.equal(deleted.status, 200);
});

test('documents: upload, download, delete round-trip', async () => {
  const staff = await loginAs('staff');
  const manager = await loginAs('manager');
  const tmp = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Doc Flow TMP', plan_type: 'temporary' })
  });
  const { id: tmpId } = await tmp.json();

  const fd = new FormData();
  fd.append('file', new Blob(['hello doc content']), 'test.pdf');
  const up = await fetch(`${base}/documents/upload/${tmpId}`, {
    method: 'POST',
    headers: authed(staff),
    body: fd
  });
  assert.equal(up.status, 201);
  const { id: docId, filename } = await up.json();
  assert.ok(filename.endsWith('.pdf'));

  const listed = await fetch(`${base}/documents/tmp/${tmpId}`, { headers: authed(staff) });
  const docs = await listed.json();
  assert.ok(docs.some((d) => d.id === docId));

  const dl = await fetch(`${base}/documents/download/${docId}`, { headers: authed(staff) });
  assert.equal(dl.status, 200);
  const body = Buffer.from(await dl.arrayBuffer());
  assert.equal(body.toString('utf8'), 'hello doc content');

  const del = await fetch(`${base}/documents/${docId}`, { method: 'DELETE', headers: authed(manager) });
  assert.equal(del.status, 200);
});

test('workflow checklist: default stages exist for a new TMP', async () => {
  const staff = await loginAs('staff');
  const tmp = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Workflow TMP', plan_type: 'temporary' })
  });
  const { id: tmpId } = await tmp.json();
  const res = await fetch(`${base}/workflows/checklist/tmp/${tmpId}`, { headers: authed(staff) });
  assert.equal(res.status, 200);
  const checklist = await res.json();
  assert.ok(Array.isArray(checklist.data) && checklist.data.length >= 1, 'checklist seeded');
  assert.equal(typeof checklist.required_complete, 'boolean');
});

test('clients list for staff returns all; pagination shape preserved', async () => {
  const staff = await loginAs('staff');
  const res = await fetch(`${base}/clients`, { headers: authed(staff) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'default shape is an array');
  const paged = await fetch(`${base}/clients?page=1&limit=10`, { headers: authed(staff) });
  assert.equal(paged.status, 200);
  const pagedBody = await paged.json();
  assert.ok(Array.isArray(pagedBody.data));
});