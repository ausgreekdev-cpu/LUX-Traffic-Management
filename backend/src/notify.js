import { v4 as uuid } from 'uuid';
import db from './db.js';

export function notifyUsers(userId, { type, title, message, entity_type, entity_id, dedupe_key }) {
  const users = userId
    ? db.prepare('SELECT id FROM users WHERE id = ?').all(userId)
    : db.prepare('SELECT id FROM users WHERE role != "viewer"').all();
  let created = 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO notifications (id, user_id, type, title, message, entity_type, entity_id, dedupe_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((list) => {
    for (const u of list) {
      const result = insert.run(uuid(), u.id, type, title, message, entity_type, entity_id, dedupe_key);
      created += result.changes;
    }
  });
  tx(users);
  return created;
}

export function notifyRole(role, { type, title, message, entity_type, entity_id, dedupe_key }) {
  const users = db.prepare('SELECT id FROM users WHERE role = ?').all(role);
  let created = 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO notifications (id, user_id, type, title, message, entity_type, entity_id, dedupe_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((list) => {
    for (const u of list) {
      const result = insert.run(uuid(), u.id, type, title, message, entity_type, entity_id, dedupe_key);
      created += result.changes;
    }
  });
  tx(users);
  return created;
}
