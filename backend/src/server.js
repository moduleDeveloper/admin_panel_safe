import express from 'express';
import cors from 'cors';
import { config } from './config/config.js';
import videoRoutes from './routes/videoRoutes.js';
import socialRoutes from './routes/socialRoutes.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'video-backend' });
});

app.use('/api/video', videoRoutes);
app.use('/api/social', socialRoutes);

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Video backend running at http://localhost:${config.port}`);
});
