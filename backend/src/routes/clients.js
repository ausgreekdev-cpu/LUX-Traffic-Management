import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  res.json(clients);
});

router.get('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

router.post('/', validate('client'), (req, res) => {
  const id = uuid();
  const { name, company, email, phone, address, abn } = req.validated;
  db.prepare('INSERT INTO clients (id, name, company, email, phone, address, abn) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, company || null, email || null, phone || null, address || null, abn || null);
  res.status(201).json({ id, name, company, email, phone, address, abn });
});

router.put('/:id', validate('client'), (req, res) => {
  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  const { name, company, email, phone, address, abn } = req.validated;
  db.prepare('UPDATE clients SET name=?, company=?, email=?, phone=?, address=?, abn=?, updated_at=datetime("now") WHERE id=?').run(name, company || null, email || null, phone || null, address || null, abn || null, req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });
  res.json({ success: true });
});

export default router;
