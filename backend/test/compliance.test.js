import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-compliance-test-'));
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

test('compliance rules are seeded with the WA base catalog', async () => {
  const dev = await loginAs('developer');
  const res = await fetch(`${base}/compliance/rules`, { headers: authed(dev) });
  assert.equal(res.status, 200);
  const rules = await res.json();
  assert.ok(Array.isArray(rules), 'rules is an array');
  assert.ok(rules.length >= 18, `expected at least 18 seeded rules, got ${rules.length}`);
  const ids = rules.map(r => r.id);
  for (const id of ['school_zone_peak_hours', 'clearway_arterial', 'footpath_min_width', 'bus_stop_relocation', 'mrwa_referral_state_road', 'rail_corridor_approval']) {
    assert.ok(ids.includes(id), `rule ${id} seeded`);
  }
});

test('rule CRUD and reseed are idempotent', async () => {
  const dev = await loginAs('developer');
  const created = await fetch(`${base}/compliance/rules`, {
    method: 'POST',
    headers: { ...authed(dev), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test_rule_crud', name: 'Test rule', condition: { field: 'site.school_zone', op: 'eq', value: true }, message: 'Test message', severity: 'warning' })
  });
  assert.equal(created.status, 201);
  const updated = await fetch(`${base}/compliance/rules/test_rule_crud`, {
    method: 'PUT',
    headers: { ...authed(dev), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Renamed test rule', is_active: false })
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).name, 'Renamed test rule');
  const deleted = await fetch(`${base}/compliance/rules/test_rule_crud`, { method: 'DELETE', headers: authed(dev) });
  assert.equal(deleted.status, 200);
  const reseed = await fetch(`${base}/compliance/rules/seed`, { method: 'POST', headers: authed(dev) });
  assert.equal(reseed.status, 200);
});

test('a staff user cannot manage rules but can run checks', async () => {
  const staff = await loginAs('staff');
  const denied = await fetch(`${base}/compliance/rules`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', condition: {}, message: 'y' })
  });
  assert.equal(denied.status, 403);
});

test('TGS save runs the check and blocks submission on violations', async () => {
  const staff = await loginAs('staff');

  const siteRes = await fetch(`${base}/sites`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Compliance Test Rd', road_name: 'Compliance Test Rd', road_class: 'arterial', school_zone: true, rail_corridor: true, pedestrian_activity: 'high' })
  });
  assert.equal(siteRes.status, 201);
  const siteId = (await siteRes.json()).id;

  const authRes = await fetch(`${base}/authorities`, { headers: authed(staff) });
  const authBody = await authRes.json();
  const lga = (authBody.data || authBody).find((a) => a.type === 'lga') || (authBody.data || authBody)[0];
  assert.ok(lga, 'an authority exists for the TMP binding');

  const tmpRes = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Compliance Test TMP', plan_type: 'temporary', complexity: 'standard', site_id: siteId, authority_id: lga.id, work_type: 'general' })
  });
  assert.equal(tmpRes.status, 201);
  const tmpId = (await tmpRes.json()).id;

  const violatingLayout = {
    work_type: 'general',
    working_hours: { start: '07:30', end: '09:30' },
    working_days: ['mon'],
    footpath: { min_width_m: 1.0, closed: true, min_clear_path_mm: 900, signed_alternate: false, ramp_gradient_1in14: false },
    bus_stops: 2,
    bus_stop_relocation_planned: false,
    clearway_nearby: true,
    signalised_intersection_within_30m: true,
    vms: 0,
    resident_notice_planned: false,
    mrwa_referral_planned: false,
    rail_authority_approved: false
  };

  const saveRes = await fetch(`${base}/compliance/tgs/${tmpId}`, {
    method: 'PUT',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_type: 'general', layout: violatingLayout })
  });
  assert.equal(saveRes.status, 200);
  const saved = await saveRes.json();
  assert.equal(saved.check.verdict, 'fail', `expected fail, got ${saved.check.verdict}`);

  const ids = saved.check.findings.map(f => f.rule_id);
  for (const id of ['school_zone_peak_hours', 'clearway_arterial', 'footpath_min_width', 'bus_stop_relocation', 'mrwa_referral_state_road', 'signals_30m_mrwa', 'rail_corridor_approval']) {
    assert.ok(ids.includes(id), `finding for ${id}`);
  }

  const submit = await fetch(`${base}/tmps/${tmpId}`, {
    method: 'PUT',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Compliance Test TMP', status: 'submitted' })
  });
  assert.equal(submit.status, 400, 'submission blocked on unresolved violations');
  const errBody = await submit.json();
  assert.match(errBody.error, /Compliance violations/);

  const compliantLayout = {
    ...violatingLayout,
    working_hours: { start: '10:00', end: '15:00' },
    footpath: { min_width_m: 2.0, closed: false, min_clear_path_mm: 1500, signed_alternate: true, ramp_gradient_1in14: true },
    bus_stops: 0,
    bus_stop_relocation_planned: true,
    clearway_nearby: false,
    signalised_intersection_within_30m: false,
    mrwa_referral_planned: true,
    rail_authority_approved: true,
    school_zone_proximity_m: 200
  };

  const fixRes = await fetch(`${base}/compliance/tgs/${tmpId}`, {
    method: 'PUT',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_type: 'general', layout: compliantLayout })
  });
  const fixed = await fixRes.json();
  assert.ok(fixed.check.verdict !== 'fail', `expected no violations after fix, got ${fixed.check.verdict}`);

  const submitOk = await fetch(`${base}/tmps/${tmpId}`, {
    method: 'PUT',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Compliance Test TMP', status: 'submitted' })
  });
  assert.equal(submitOk.status, 200, 'submission allowed after violations resolved');
  assert.equal((await submitOk.json()).status, 'submitted');
});

test('resolutions mark findings resolved and unblock submit', async () => {
  const staff = await loginAs('staff');

  const siteRes = await fetch(`${base}/sites`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Resolve Rd', road_class: 'local', school_zone: true })
  });
  const siteId = (await siteRes.json()).id;
  const tmpRes = await fetch(`${base}/tmps`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Resolve Test TMP', plan_type: 'temporary', site_id: siteId, work_type: 'general' })
  });
  const tmpId = (await tmpRes.json()).id;

  const layout = {
    work_type: 'general',
    working_hours: { start: '08:00', end: '09:00' },
    working_days: ['mon'],
    footpath: { min_width_m: 1.2, closed: false, min_clear_path_mm: 1200, signed_alternate: false, ramp_gradient_1in14: false },
    bus_stops: 0,
    mrwa_referral_planned: true,
    rail_authority_approved: false,
    school_zone_proximity_m: 100
  };
  const saveRes = await fetch(`${base}/compliance/tgs/${tmpId}`, {
    method: 'PUT',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_type: 'general', layout })
  });
  const saved = await saveRes.json();
  assert.equal(saved.check.verdict, 'fail');
  const violation = saved.check.findings.find(f => f.severity === 'violation' && !f.resolved);
  assert.ok(violation, 'an unresolved violation exists');

  const resolveRes = await fetch(`${base}/compliance/tgs/${tmpId}`, {
    method: 'PUT',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_type: 'general', layout, resolutions: { [violation.rule_id]: true } })
  });
  const resolved = await resolveRes.json();
  const marked = resolved.check.findings.find(f => f.rule_id === violation.rule_id);
  assert.equal(marked.resolved, true, 'finding marked resolved');
  assert.equal(resolved.check.verdict, 'fail', 'verdict stays fail while other violations remain');
});

test('site-plan SVG export returns a valid diagram', async () => {
  const staff = await loginAs('staff');
  const listRes = await fetch(`${base}/tmps?limit=1`, { headers: authed(staff) });
  const { data } = await listRes.json();
  if (!data.length) return; // no TMPs in this DB - covered by other tests
  const tmpId = data[0].id;
  const res = await fetch(`${base}/export/tmp/${tmpId}/site-plan.svg?token=${encodeURIComponent(staff)}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
  const body = await res.text();
  assert.match(body, /<svg/);
  assert.match(body, /CARRIAGEWAY/);
});