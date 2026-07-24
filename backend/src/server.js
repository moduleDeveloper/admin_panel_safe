import WebSocket from 'ws';
import express from 'express';
import cors from 'cors';
import { config } from './config/config.js';
import videoRoutes from './routes/videoRoutes.js';
import socialRoutes from './routes/socialRoutes.js';
import leadsRoutes from './routes/leadsRoutes.js';
import waTemplateRoutes from './routes/waTemplateRoutes.js';

globalThis.WebSocket = WebSocket;

const app = express();

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (curl/server-to-server) with no Origin header.
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/.*\.vercel\.app$/i.test(origin)) return callback(null, true);
    if (/^http:\/\/localhost:\d+$/i.test(origin)) return callback(null, true);
    // Fallback: reflect provided origin so preflight does not fail hard.
    return callback(null, true);
  },
}));
app.options('*', cors());
app.use(express.json({ limit: '20mb' }));

app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return res.json({
    ok: true,
    service: 'video-backend',
    health: `${baseUrl}/health`,
    routes: {
      video_base: `${baseUrl}/api/video`,
      social_base: `${baseUrl}/api/social`,
      video: [
        '/api/video/generate-script',
        '/api/video/save-script',
        '/api/video/approve-script',
        '/api/video/generate-voiceover',
        '/api/video/generate-scene-plan',
        '/api/video/save-scene-plan',
        '/api/video/generate-scene-visual',
        '/api/video/approve-scene-image',
        '/api/video/approve-scene-motion',
        '/api/video/generate-scene-motion',
        '/api/video/save-scene-motion',
        '/api/video/update-project-status',
        '/api/video/render-final-video',
        '/api/video/project',
        '/api/video/project-assets',
        '/api/video/final-videos',
        '/api/video/asset-library',
        '/api/video/final-video/:assetId',
        '/api/video/download-final-video',
      ],
      social: [
        '/api/social/accounts/:trustId',
        '/api/social/post',
      ],
      leads: [
        '/api/leads/:trustId/member-match',
        '/api/leads/:trustId/trust-member-match',
        '/api/leads/:trustId',
        '/api/leads/mkt-data/search',
        '/api/leads/mkt-data/manage',
      ],
      whatsapp_templates: [
        '/api/whatsapp-templates/:trustId',
      ],
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'video-backend' });
});

app.use('/api/video', videoRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/whatsapp-templates', waTemplateRoutes);

app.use((err, _req, res, next) => {
  void next;
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Video backend running at http://localhost:${config.port}`);
});
