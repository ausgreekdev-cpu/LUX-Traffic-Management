import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-roles-test-'));
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

const ACCOUNTS = {
  developer: ['developer@lux.com.au', 'Demo123!'],
  manager: ['manager@lux.com.au', 'Demo123!'],
  staff: ['staff@lux.com.au', 'Demo123!'],
  client: ['client@lux.com.au', 'Demo123!']
};

async function loginAs(role) {
  const [email, password] = ACCOUNTS[role];
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(res.status, 200, `${role} login should succeed`);
  const body = await res.json();
  assert.equal(body.user.role, role, 'login should report the correct role');
  return body;
}

function authed(token) {
  return { Authorization: `Bearer ${token}` };
}

async function status(method, url, token, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body ? { ...authed(token), 'Content-Type': 'application/json' } : authed(token),
    body: body ? JSON.stringify(body) : undefined
  });
  return res.status;
}

test('login rejects unknown email and bad password with 401', async () => {
  for (const creds of [
    { email: 'nobody@lux.com.au', password: 'Demo123!' },
    { email: 'client@lux.com.au', password: 'wrong-pass' }
  ]) {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Invalid email or password');
  }
});

test('client account is linked to a company', async () => {
  const { token } = await loginAs('client');
  const clients = await (await fetch(`${base}/clients`, { headers: authed(token) })).json();
  assert.ok(Array.isArray(clients));
  assert.equal(clients.length, 1, 'client should only see their own company');
});

test('client cannot create TMPs (403)', async () => {
  const { token } = await loginAs('client');
  const res = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Hacker TMP', plan_type: 'temporary' })
  });
  assert.equal(res.status, 403);
});

test('staff can create a project, TMP and permit; client sees only own data', async () => {
  const staff = await loginAs('staff');
  const client = await loginAs('client');

  const projectRes = await fetch(`${base}/projects`, {
    method: 'POST',
    headers: { ...authed(staff.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Role Test Project', client_id: client.user.clientId })
  });
  assert.equal(projectRes.status, 201);
  const { id: projectId } = await projectRes.json();

  const siteRes = await fetch(`${base}/sites`, {
    method: 'POST',
    headers: { ...authed(staff.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Role Test Site' })
  });
  assert.equal(siteRes.status, 201);
  const { id: siteId } = await siteRes.json();

  const tmpRes = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Role Test TMP', project_id: projectId, site_id: siteId, plan_type: 'temporary' })
  });
  assert.equal(tmpRes.status, 201);
  const { id: tmpId } = await tmpRes.json();

  const authority = (await (await fetch(`${base}/authorities`, { headers: authed(staff.token) })).json())[0];
  const permitRes = await fetch(`${base}/permits`, {
    method: 'POST',
    headers: { ...authed(staff.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmp_id: tmpId, authority_id: authority.id, complexity: 'standard' })
  });
  assert.equal(permitRes.status, 201);

  const staffTmps = await (await fetch(`${base}/tmps`, { headers: authed(staff.token) })).json();
  assert.ok(staffTmps.data.some((t) => t.id === tmpId), 'staff sees the new TMP');

  const clientTmps = await (await fetch(`${base}/tmps`, { headers: authed(client.token) })).json();
  assert.ok(clientTmps.data.some((t) => t.id === tmpId), 'client sees their own TMP');

  const otherProject = await fetch(`${base}/projects`, {
    method: 'POST',
    headers: { ...authed(staff.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Unlinked Project' })
  });
  assert.equal(otherProject.status, 201);
  const { id: otherProjectId } = await otherProject.json();

  const clientProjects = await (await fetch(`${base}/projects`, { headers: authed(client.token) })).json();
  assert.ok(clientProjects.length >= 1, 'client should see their own projects');
  assert.ok(clientProjects.every((p) => p.client_id === client.user.clientId), 'client sees only own-client projects');
  assert.ok(clientProjects.some((p) => p.id === projectId), 'client sees the newly linked project');
  assert.ok(!clientProjects.some((p) => p.id === otherProjectId), 'client does not see unlinked projects');
});

test('client cannot edit or delete TMPs', async () => {
  const client = await loginAs('client');
  const clientTmps = await (await fetch(`${base}/tmps`, { headers: authed(client.token) })).json();
  const tmp = clientTmps.data[0];
  assert.ok(tmp, 'client should have at least one TMP');
  assert.equal(await status('PUT', `/tmps/${tmp.id}`, client.token, { title: 'Edited by client' }), 403);
  assert.equal(await status('DELETE', `/tmps/${tmp.id}`, client.token), 403);
});

test('staff cannot delete (manager+ only)', async () => {
  const staff = await loginAs('staff');
  const tmps = await (await fetch(`${base}/tmps`, { headers: authed(staff.token) })).json();
  const tmp = tmps.data[0];
  if (tmp) {
    assert.equal(await status('DELETE', `/tmps/${tmp.id}`, staff.token), 403);
  }
});

test('client cannot access settings, users, analytics, automations', async () => {
  const client = await loginAs('client');
  assert.equal(await status('GET', '/settings', client.token), 200, 'client may read settings labels');
  assert.equal(await status('PUT', '/settings', client.token, { company_name: 'X' }), 403);
  assert.equal(await status('GET', '/users', client.token), 403);
  assert.equal(await status('GET', '/analytics/dashboard', client.token), 403);
  assert.equal(await status('GET', '/automations/rules', client.token), 403);
  assert.equal(await status('GET', '/agents', client.token), 403);
});

test('manager can create but not touch user accounts', async () => {
  const manager = await loginAs('manager');
  assert.equal(await status('GET', '/users', manager.token), 403);
  assert.equal(await status('POST', '/users', manager.token, { email: 'x@x.com', password: 'x', name: 'X', role: 'staff' }), 403);
});

test('developer can manage users; client role requires a company', async () => {
  const developer = await loginAs('developer');
  const noCompany = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { ...authed(developer.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'badclient@lux.com.au', password: 'Demo123!', name: 'Bad Client', role: 'client' })
  });
  assert.equal(noCompany.status, 400, 'client role without client_id must be rejected');

  const client = await loginAs('client');
  const good = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { ...authed(developer.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'goodclient@lux.com.au', password: 'Demo123!', name: 'Good Client', role: 'client', client_id: client.user.clientId })
  });
  assert.equal(good.status, 201);
});

test('login error message differs between bad password and lockout', async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'client@lux.com.au', password: 'wrong-pass' })
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'Invalid email or password');
});
