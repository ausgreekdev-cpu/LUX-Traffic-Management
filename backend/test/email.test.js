import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-email-test-'));
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
    staff: ['staff@lux.com.au', 'Demo123!'],
    manager: ['manager@lux.com.au', 'Demo123!']
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

test('email config: save SMTP + Postmark, masked on read, kept on blank', async () => {
  const developer = await loginAs('developer');

  const save = await fetch(`${base}/email/config`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: 'smtp.test.dev', port: 587, user: 'tester', pass: 's3cr3t-pass',
      from_name: 'LUX', from_email: 'test@lux.com.au',
      postmark_token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', postmark_from_name: 'LUX PM', postmark_from_email: 'office@lux.com.au'
    })
  });
  assert.equal(save.status, 200);
  assert.ok(save.ok || true);

  const cfg = await (await fetch(`${base}/email/config`, { headers: authed(developer) })).json();
  assert.equal(cfg.provider, 'postmark', 'postmark wins when token present');
  assert.equal(cfg.pass, '', 'smtp pass is not returned');
  assert.equal(cfg.has_pass, true, 'has_pass indicates stored smtp pass');
  assert.equal(cfg.postmark_token, '', 'postmark token is not returned');
  assert.equal(cfg.has_postmark_token, true, 'has_postmark_token indicates stored token');

  const saveBlank = await fetch(`${base}/email/config`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: 'smtp.test.dev', pass: '', postmark_token: '' })
  });
  assert.equal(saveBlank.status, 200);

  const cfg2 = await (await fetch(`${base}/email/config`, { headers: authed(developer) })).json();
  assert.equal(cfg2.has_postmark_token, true, 'blank token keeps the existing one');
  assert.equal(cfg2.has_pass, true, 'blank pass keeps the existing one');
});

test('settings GET masks secrets including postmark token', async () => {
  const developer = await loginAs('developer');
  const settings = await (await fetch(`${base}/settings`, { headers: authed(developer) })).json();
  for (const key of ['smtp_pass', 'webhook_secret', 'postmark_api_token', 'jwt_secret']) {
    if (settings[key] !== undefined) {
      assert.notEqual(settings[key], 'super-secret-value', `${key} should not leak`);
      assert.ok(settings[key].includes('\u2022'), `${key} should be masked`);
    }
  }
});

test('settings PUT does not overwrite a secret with the masked placeholder', async () => {
  const developer = await loginAs('developer');
  const before = await (await fetch(`${base}/email/config`, { headers: authed(developer) })).json();
  assert.equal(before.has_postmark_token, true);

  const res = await fetch(`${base}/settings`, {
    method: 'PUT',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ postmark_api_token: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', company_name: 'LUX Traffic' })
  });
  assert.equal(res.status, 200);

  const after = await (await fetch(`${base}/email/config`, { headers: authed(developer) })).json();
  assert.equal(after.has_postmark_token, true, 'masked placeholder did not clobber stored token');
});

test('email template create + preview renders placeholders', async () => {
  const developer = await loginAs('developer');
  const created = await fetch(`${base}/email/templates`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Template', subject: 'Hello {name}', body: 'Body for {name}' })
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const preview = await fetch(`${base}/email/templates/${id}/preview`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ctx: { name: 'World' } })
  });
  assert.equal(preview.status, 200);
  const rendered = await preview.json();
  assert.equal(rendered.subject, 'Hello World');
  assert.equal(rendered.body, 'Body for World');

  const del = await fetch(`${base}/email/templates/${id}`, { method: 'DELETE', headers: authed(developer) });
  assert.equal(del.status, 200);
});

test('email template html_body: create, update, preview (id + draft), role gate', async () => {
  const developer = await loginAs('developer');
  const staff = await loginAs('staff');

  const created = await fetch(`${base}/email/templates`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Tpl With Html',
      subject: 'Permit {reference}',
      body: 'Plain fallback for {reference}',
      html_body: '<html><body><b>Permit {reference}</b> approved for {customer_name}.</body></html>'
    })
  });
  assert.equal(created.status, 201);
  const tpl = await created.json();
  assert.ok(tpl.html_body.includes('{reference}'), 'html_body persisted on create');

  const preview = await (await fetch(`${base}/email/templates/${tpl.id}/preview`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ctx: { reference: 'TMP-1', customer_name: 'ACME' } })
  })).json();
  assert.equal(preview.subject, 'Permit TMP-1');
  assert.equal(preview.html_body, '<html><body><b>Permit TMP-1</b> approved for ACME.</body></html>');

  const updated = await fetch(`${base}/email/templates/${tpl.id}`, {
    method: 'PUT',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tpl With Html', subject: 'Permit {reference}', body: 'Plain fallback for {reference}', html_body: '' })
  });
  assert.equal(updated.status, 200);
  const cleared = await updated.json();
  assert.equal(cleared.html_body, null, 'empty html_body stored as NULL');

  const draft = await (await fetch(`${base}/email/templates/preview`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      draft: { subject: 'Hi {name}', body: 'text {name}', html_body: '<p>Hello {name}</p>' },
      ctx: { name: 'World' }
    })
  })).json();
  assert.equal(draft.subject, 'Hi World');
  assert.equal(draft.html_body, '<p>Hello World</p>');

  const gated = await fetch(`${base}/email/templates`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'staff tpl', subject: 's', body: 'b' })
  });
  assert.equal(gated.status, 403, 'template create is developer-only');

  const del = await fetch(`${base}/email/templates/${tpl.id}`, { method: 'DELETE', headers: authed(developer) });
  assert.equal(del.status, 200);
});

test('email logs list returns default array shape', async () => {
  const manager = await loginAs('manager');
  const res = await fetch(`${base}/email/logs`, { headers: authed(manager) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'logs default shape is an array');
});

test('email config: explicit provider choice overrides postmark token', async () => {
  const developer = await loginAs('developer');

  const switchToSmtp = await fetch(`${base}/email/config`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'smtp', host: 'smtp.office365.com', port: 587, user: 'me@test.dev' })
  });
  assert.equal(switchToSmtp.status, 200);

  const cfg = await (await fetch(`${base}/email/config`, { headers: authed(developer) })).json();
  assert.equal(cfg.provider, 'smtp', 'explicit smtp wins over stored postmark token');

  const switchToPostmark = await fetch(`${base}/email/config`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'postmark' })
  });
  assert.equal(switchToPostmark.status, 200);

  const cfg2 = await (await fetch(`${base}/email/config`, { headers: authed(developer) })).json();
  assert.equal(cfg2.provider, 'postmark', 'explicit postmark restored');

  const backToAuto = await fetch(`${base}/email/config`, {
    method: 'POST',
    headers: { ...authed(developer), 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: '', host: 'smtp.office365.com' })
  });
  assert.equal(backToAuto.status, 200);
  const cfg3 = await (await fetch(`${base}/email/config`, { headers: authed(developer) })).json();
  assert.equal(cfg3.provider, 'postmark', 'auto still prefers postmark when a token is stored');
});

test('email config write is developer-only (staff gets 403)', async () => {
  const staff = await loginAs('staff');
  const res = await fetch(`${base}/email/config`, {
    method: 'POST',
    headers: { ...authed(staff), 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: 'smtp.test.dev' })
  });
  assert.equal(res.status, 403);
});