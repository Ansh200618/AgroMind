import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import dashboardRouter from './routes/dashboard';
import diseaseRouter from './routes/disease';
import chatRouter from './routes/chat';
import cropsRouter from './routes/crops';
import sensorsRouter from './routes/sensors';
import irrigationRouter from './routes/irrigation';
import settingsRouter from './routes/settings';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Ensure upload directory exists ──────────────────────────────────────────
const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(uploadDir));

// Serve frontend from project root (one level up from backend)
app.use(express.static(path.resolve(__dirname, '../../')));

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/dashboard', dashboardRouter);
app.use('/api/disease', diseaseRouter);
app.use('/api/chat', chatRouter);
app.use('/api/crops', cropsRouter);
app.use('/api/sensors', sensorsRouter);
app.use('/api/irrigation', irrigationRouter);
app.use('/api/settings', settingsRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 catch-all for API routes ─────────────────────────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌿 Agro Mind API running on http://localhost:${PORT}`);
});

export default app;
