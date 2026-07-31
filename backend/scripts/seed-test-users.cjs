// Seeds the two test users used by scripts/api-suite.ps1 (idempotent).
// Usage: node backend/scripts/seed-test-users.cjs   (DB path: DB_PATH env, else backend/data/tmpcms.db)
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tmpcms.db');
const db = new Database(dbPath);

const upsert = db.prepare(
  'INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET password = excluded.password, name = excluded.name, role = excluded.role'
);

const seed = db.transaction(() => {
  upsert.run('u-tadmin', 'admin@test.com', bcrypt.hashSync('adminpass', 10), 'Test Admin', 'admin');
  upsert.run('u-tplanner', 'planner@test.com', bcrypt.hashSync('planpass', 10), 'Test Planner', 'planner');
});

seed();
console.log('Seeded test users into ' + dbPath);
