const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-secret-key-for-testing';

const auth = require('./middleware/auth');

describe('auth module', () => {
  it('generates and verifies tokens', () => {
    const user = { id: 'u1', username: 'testuser', role: 'admin' };
    const token = auth.generateToken(user);
    assert.ok(token);
    assert.ok(typeof token === 'string');

    const decoded = auth.verifyToken(token);
    assert.ok(decoded);
    assert.equal(decoded.id, 'u1');
    assert.equal(decoded.username, 'testuser');
    assert.equal(decoded.role, 'admin');
  });

  it('returns null for invalid token', () => {
    const result = auth.verifyToken('invalid-token');
    assert.equal(result, null);
  });

  it('hashes and verifies passwords', () => {
    const hash = auth.hashPassword('mypassword');
    assert.ok(hash);
    assert.notEqual(hash, 'mypassword');
    assert.ok(auth.verifyPassword('mypassword', hash));
    assert.ok(!auth.verifyPassword('wrongpassword', hash));
  });

  it('exports ROLES with correct permissions', () => {
    assert.ok(auth.ROLES.admin.canEdit);
    assert.ok(auth.ROLES.admin.canDelete);
    assert.ok(auth.ROLES.admin.canManageSettings);
    assert.ok(!auth.ROLES.viewer.canEdit);
    assert.ok(!auth.ROLES.viewer.canDelete);
    assert.ok(!auth.ROLES.viewer.canManageSettings);
  });
});

describe('JWT_SECRET required', () => {
  it('JWT_SECRET is set in test environment', () => {
    assert.ok(process.env.JWT_SECRET);
  });
});
