# Vibes✦ — Deployment Guide

## Project Structure

```
vibes/
├── backend/              ← Node.js + Express API
│   ├── server.js         ← Entry point (port 4000)
│   ├── db/
│   │   ├── schema.sql    ← PostgreSQL tables
│   │   └── pool.js       ← DB connection
│   ├── routes/
│   │   ├── auth.js       ← Register, login, JWT
│   │   ├── profile.js    ← Get/update profile
│   │   ├── links.js      ← CRUD links + click tracking
│   │   ├── photos.js     ← Upload/delete photos (HiDrive)
│   │   ├── analytics.js  ← Page views + link clicks
│   │   └── tier.js       ← Plan upgrades
│   ├── middleware/
│   │   ├── auth.js       ← JWT verification
│   │   ├── tiers.js      ← Plan limits
│   │   └── hidrive.js    ← IONOS HiDrive WebDAV
│   └── .env.example      ← Copy to .env and fill in
├── frontend/             ← React + Vite
│   ├── src/
│   │   ├── App.jsx       ← Full UI
│   │   ├── api.js        ← API client
│   │   └── main.jsx      ← Entry point
│   └── vite.config.js
├── nginx/
│   └── vibes.conf        ← Nginx server block
└── scripts/
    ├── setup.sh          ← One-time VPS setup
    └── deploy.sh         ← Run after each update
```

---

## Step 1 — Point your domain

In your IONOS domain settings, add an A record:
- **Name:** `vibes` (or `@` for the root domain)
- **Value:** your VPS IP address
- Wait 5–30 min for DNS to propagate

---

## Step 2 — Run the setup script (once)

SSH into your VPS:
```bash
ssh root@your-vps-ip
```

Upload and run:
```bash
bash setup.sh vibes.yourdomain.com your@email.com
```

This installs: Node.js 20, PostgreSQL, Nginx, PM2, certbot (free SSL), UFW firewall.

**Save the DB password it prints** — you'll need it.

---

## Step 3 — Upload your code

From your local machine:
```bash
scp -r ./vibes root@your-vps-ip:/var/www/
```

Or use FileZilla / WinSCP if you prefer a GUI.

---

## Step 4 — Configure environment variables

On the VPS:
```bash
cp /var/www/vibes/backend/.env.example /var/www/vibes/backend/.env
nano /var/www/vibes/backend/.env
```

Fill in:
```env
DB_PASSWORD=<password from setup script>
JWT_SECRET=<generate one: openssl rand -base64 64>
FRONTEND_URL=https://vibes.yourdomain.com

# HiDrive — log in at hidrive.ionos.com to find these
HIDRIVE_USER=your_ionos_email
HIDRIVE_PASS=your_hidrive_password
HIDRIVE_BASE_PATH=/users/your_ionos_email/vibes-uploads

IMAGE_BASE_URL=https://vibes.yourdomain.com/api/images
```

---

## Step 5 — Deploy

```bash
cd /var/www/vibes
bash scripts/deploy.sh
```

This:
1. Installs npm packages
2. Runs the database schema
3. Starts the API with PM2
4. Builds the React frontend
5. Reloads Nginx

---

## Step 6 — Verify

```bash
# API health check
curl https://vibes.yourdomain.com/api/health

# View backend logs
pm2 logs vibes-api

# View Nginx logs
tail -f /var/log/nginx/error.log
```

---

## HiDrive Setup

1. Log in to your IONOS account → HiDrive
2. Create a folder called `vibes-uploads`
3. Use your IONOS email and password in `.env`
4. The app will auto-create user subfolders

---

## Updating the app

After making changes locally:
```bash
# Upload new files
scp -r ./vibes root@your-vps-ip:/var/www/

# Re-deploy on VPS
cd /var/www/vibes && bash scripts/deploy.sh
```

---

## Presave Campaigns (Spotify + Apple Music)

Pro and Creator users can run a "Pre-save" card on their page with a release countdown.

**Apple Music** — works immediately, no setup needed. It's just a tap-through link to the album/track (Apple has no public pre-add API).

**Spotify pre-save** — lets fans authorize once, and the track/album is automatically saved to their library on release day. This requires a Spotify Developer app:

1. Go to https://developer.spotify.com/dashboard and create an app
2. Set the **Redirect URI** to `https://vibes.yourdomain.com/api/presave/spotify/callback`
3. Copy the **Client ID** and **Client Secret** into `.env`:
   ```env
   SPOTIFY_CLIENT_ID=xxxxx
   SPOTIFY_CLIENT_SECRET=xxxxx
   SPOTIFY_REDIRECT_URI=https://vibes.yourdomain.com/api/presave/spotify/callback
   ```
4. Re-deploy (`bash scripts/deploy.sh`)

**Finding a Spotify track/album ID** — open the share link, e.g.
`open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC` → the ID is `4uLU6hMCjMI75M1A2tKUQC`.

Until a Spotify app is configured, the pre-save button shows "Spotify pre-save isn't configured for this page yet" instead of erroring.

---

## Presave Milestone Emails

When a campaign crosses 10, 25, 50, 100, 250, 500, 1,000... presaves, Vibes can email the creator automatically.

1. Set SMTP credentials in `.env`. For IONOS mail:
   ```env
   SMTP_HOST=smtp.ionos.com
   SMTP_PORT=587
   SMTP_USER=noreply@yourdomain.com
   SMTP_PASS=your_mailbox_password
   SMTP_FROM="Vibes ✦ <noreply@yourdomain.com>"
   ```
2. Each user sets their notification email under **Settings** in the dashboard, and can toggle milestone emails on/off.
3. If SMTP isn't configured, the server logs a warning once and milestone emails are silently skipped — nothing else breaks.

---

## CSV Export

Pro and Creator users can click **Export CSV** on the Analytics tab to download a spreadsheet with page views by day, top links, traffic sources, and (if configured) presave campaign stats — generated client-side, no extra setup needed.

---

## Adding Stripe (production billing)

1. Create a Stripe account at stripe.com
2. Add `STRIPE_SECRET_KEY` to your `.env`
3. In `backend/routes/tier.js`, replace the mock upgrade with:
```js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Create checkout session → webhook → update tier in DB
```
4. Stripe prices: Free ($0), Pro ($5/mo), Creator ($9/mo)

---

## PM2 Cheatsheet

```bash
pm2 status          # See running processes
pm2 logs vibes-api  # Live logs
pm2 restart vibes-api
pm2 stop vibes-api
pm2 startup         # Auto-start on server reboot
```

---

## Costs Summary

| Service       | Cost       |
|---------------|------------|
| IONOS VPS     | Already paying |
| IONOS HiDrive | Already paying |
| Domain        | Already have |
| SSL (Let's Encrypt) | Free |
| PostgreSQL    | Free (self-hosted) |
| **Total extra** | **$0/mo** |

Everything runs on your existing IONOS infrastructure.
