import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import clientRoutes from './routes/clients.js';
import siteRoutes from './routes/sites.js';
import projectRoutes from './routes/projects.js';
import tmpRoutes from './routes/tmps.js';
import documentRoutes from './routes/documents.js';
import dashboardRoutes from './routes/dashboard.js';
import exportRoutes from './routes/export.js';
import emailRoutes from './routes/email.js';
import authorityRoutes from './routes/authorities.js';
import permitRoutes from './routes/permits.js';
import timeEntryRoutes from './routes/time-entries.js';
import analyticsRoutes from './routes/analytics.js';
import notificationRoutes from './routes/notifications.js';
import settingsRoutes from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || ['http://localhost:5173', 'http://localhost:3001'] }));
app.use(express.json());

const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tmps', tmpRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/authorities', authorityRoutes);
app.use('/api/permits', permitRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log('TMP CMS backend running on http://localhost:' + PORT);
  if (process.send) {
    process.send({ type: 'server-started', port: PORT });
  }
});
