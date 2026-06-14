#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Vibes Platform — VPS Setup Script
# Run once on your fresh IONOS VPS as root (or with sudo)
# Usage: bash setup.sh yourdomain.com your@email.com
# ─────────────────────────────────────────────────────────────────────────────

set -e

DOMAIN=${1:-"vibes.yourdomain.com"}
EMAIL=${2:-"your@email.com"}

echo "▶ Setting up Vibes on $DOMAIN"

# ── 1. System updates ─────────────────────────────────────────────────────────
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# ── 2. Node.js 20 ────────────────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "✓ Node $(node -v) installed"

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
npm install -g pm2
echo "✓ PM2 installed"

# ── 4. PostgreSQL ─────────────────────────────────────────────────────────────
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# Create database and user
DB_PASS=$(openssl rand -base64 24)
sudo -u postgres psql <<SQL
CREATE USER vibes_user WITH PASSWORD '$DB_PASS';
CREATE DATABASE vibes OWNER vibes_user;
GRANT ALL PRIVILEGES ON DATABASE vibes TO vibes_user;
\c vibes
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
SQL
echo "✓ PostgreSQL ready. DB password: $DB_PASS"
echo "  (Save this password — you'll need it for .env)"

# ── 5. App directory ──────────────────────────────────────────────────────────
mkdir -p /var/www/vibes
chown -R $USER:$USER /var/www/vibes

# ── 6. Firewall ───────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
echo "✓ Firewall configured"

# ── 7. Nginx ──────────────────────────────────────────────────────────────────
cat > /etc/nginx/sites-available/vibes <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    root /var/www/vibes/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass         http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        client_max_body_size 15M;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
}
NGINX

ln -sf /etc/nginx/sites-available/vibes /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo "✓ Nginx configured"

# ── 8. SSL certificate ────────────────────────────────────────────────────────
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
echo "✓ SSL certificate installed"

# ── 9. Auto-renew SSL ─────────────────────────────────────────────────────────
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✦ VPS setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Upload your code to /var/www/vibes/"
echo "  2. Create /var/www/vibes/backend/.env (see .env.example)"
echo "     DB_PASSWORD=$DB_PASS"
echo "  3. Run: bash deploy.sh"
echo "═══════════════════════════════════════════════════════"
