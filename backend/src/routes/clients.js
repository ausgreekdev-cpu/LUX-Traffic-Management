import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { isClientUser, clientOwnedByClient } from '../middleware/scope.js';
import { validate } from '../middleware/validate.js';
import { paginateResponse } from '../middleware/pagination.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  if (isClientUser(req.user)) {
    const client = req.user.clientId
      ? db.prepare('SELECT * FROM clients WHERE id = ?').get(req.user.clientId)
      : null;
    return res.json(client ? [client] : []);
  }
  const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  res.json(paginateResponse(req, clients));
});

router.get('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (isClientUser(req.user) && !clientOwnedByClient(client, req.user.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  res.json(client);
});

router.post('/', roleAtLeast('staff'), validate('client'), (req, res) => {
  const id = uuid();
  const { name, company, email, phone, address, abn } = req.validated;
  db.prepare('INSERT INTO clients (id, name, company, email, phone, address, abn) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, company || null, email || null, phone || null, address || null, abn || null);
  res.status(201).json({ id, name, company, email, phone, address, abn });
});

router.put('/:id', roleAtLeast('staff'), validate('client'), (req, res) => {
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  const { name, company, email, phone, address, abn } = req.validated;
  db.prepare('UPDATE clients SET name=?, company=?, email=?, phone=?, address=?, abn=?, updated_at=datetime(\'now\') WHERE id=?').run(name, company !== undefined ? (company || null) : existing.company, email !== undefined ? (email || null) : existing.email, phone !== undefined ? (phone || null) : existing.phone, address !== undefined ? (address || null) : existing.address, abn !== undefined ? (abn || null) : existing.abn, req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

router.delete('/:id', roleAtLeast('manager'), (req, res) => {
  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  const projectCount = db.prepare('SELECT COUNT(*) as c FROM tmp_projects WHERE client_id = ?').get(req.params.id).c;
  if (projectCount) return res.status(400).json({ error: `Client has ${projectCount} projects - delete them first` });
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
