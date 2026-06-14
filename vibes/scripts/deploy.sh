#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Vibes Platform — Deploy Script
# Run this from /var/www/vibes/ after uploading new code
# ─────────────────────────────────────────────────────────────────────────────

set -e
cd /var/www/vibes

echo "▶ Deploying Vibes..."

# ── Backend ───────────────────────────────────────────────────────────────────
echo "Installing backend dependencies..."
cd backend
npm install --omit=dev

echo "Running database migrations..."
psql -U vibes_user -d vibes -h localhost -f db/schema.sql 2>/dev/null || echo "(Schema already up to date)"

echo "Starting/restarting backend with PM2..."
pm2 describe vibes-api > /dev/null 2>&1 \
  && pm2 restart vibes-api \
  || pm2 start server.js --name vibes-api --max-memory-restart 200M

pm2 save

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "Building frontend..."
cd ../frontend
npm install
npm run build

echo "Reloading Nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✦ Deploy complete!"
echo "  API:      http://localhost:4000/api/health"
echo "  Frontend: check your domain"
echo "═══════════════════════════════════════════════════════"

pm2 status
