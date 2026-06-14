require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const fs          = require('fs');

const app = express();

// ── Security headers ────────────────────────────────────────────────────────
// CSP is disabled because we may serve the frontend from this same server
// (single-service deploys on Railway/Render); the React app needs to load
// its own inline styles and fetch the Spotify/YouTube embeds.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean),
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/profile',   require('./routes/profile'));
app.use('/api/links',     require('./routes/links'));
app.use('/api/photos',    require('./routes/photos'));
app.use('/api/images',    require('./routes/photos')); // image proxy
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/tier',      require('./routes/tier'));
app.use('/api/presave',   require('./routes/presave'));
app.use('/api/settings',  require('./routes/settings'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── 404 for unmatched API routes ──────────────────────────────────────────────
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ── Serve the built frontend (single-service deploy: Railway, Render, etc.) ──
// If frontend/dist exists (built during the deploy step), serve it and fall
// back to index.html for any non-API route so React Router-style /@username
// paths work. On a split deploy (Nginx + separate static host), this folder
// won't exist and these handlers are simply skipped.
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✦ Vibes API running on port ${PORT}`));
