# Deploying Vibes to a Free/Cheap Cloud Host

Use this while your IONOS VPS is being set up, or as a permanent home if you
don't want to manage a server at all. Both **Railway** and **Render** can run
Vibes as a single web service + a managed Postgres database — no Nginx, PM2,
or SSL setup needed (they handle all of that).

The code is already set up for this: `backend/server.js` will serve the built
React app itself when `frontend/dist` exists, so frontend + API run as one
deployable service on one URL.

---

## Option A — Railway (recommended, easiest)

### 1. Push the code to GitHub
Railway deploys from a GitHub repo. Create a new repo and push the contents
of this `vibes/` folder to it (the root should contain `package.json`,
`backend/`, `frontend/`, etc.).

### 2. Create the project
1. Go to https://railway.app → **New Project** → **Deploy from GitHub repo**
2. Select your repo

### 3. Add Postgres
1. In the project, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway creates it and exposes a `DATABASE_URL` variable automatically

### 4. Configure the web service
Click your web service → **Variables** tab → add:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<run: openssl rand -base64 64>
JWT_EXPIRES_IN=30d
NODE_ENV=production

# Will be your Railway-assigned URL, e.g. https://vibes.up.railway.app
FRONTEND_URL=https://your-app-name.up.railway.app

# HiDrive (same credentials as the VPS plan)
HIDRIVE_URL=https://webdav.hidrive.ionos.com
HIDRIVE_USER=your_ionos_email
HIDRIVE_PASS=your_hidrive_password
HIDRIVE_BASE_PATH=/users/your_ionos_email/vibes-uploads
IMAGE_BASE_URL=https://your-app-name.up.railway.app/api/images

# Optional — Spotify pre-save
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=https://your-app-name.up.railway.app/api/presave/spotify/callback

# Optional — milestone emails
SMTP_HOST=smtp.ionos.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=
SMTP_FROM="Vibes ✦ <noreply@yourdomain.com>"
```

`${{Postgres.DATABASE_URL}}` is a Railway **reference variable** — type it
literally; Railway substitutes it with the database's real connection string.

### 5. Set build & start commands
Railway usually auto-detects these from `package.json`, but double-check
under **Settings** → **Deploy**:
- **Build command:** `npm run build`
- **Start command:** `npm start`

### 6. Generate a public domain
**Settings** → **Networking** → **Generate Domain**. Copy that URL and go
back and update `FRONTEND_URL`, `IMAGE_BASE_URL`, and `SPOTIFY_REDIRECT_URI`
above to match it exactly, then redeploy.

### 7. Run the database migration (one time)
Install the Railway CLI and run the schema against the new database:
```bash
npm install -g @railway/cli
railway login
railway link            # select your project
railway run npm run db:migrate
```

### 8. Done
Visit `https://your-app-name.up.railway.app` — you should see the Vibes
landing page. Sign up and test it out.

**Cost:** Railway gives $5/month of free usage on the trial plan, then it's
pay-as-you-go (small Postgres + Node service is typically $2–6/month).

---

## Option B — Render

### 1. Push to GitHub (same as above)

### 2. Create the database
1. https://render.com → **New** → **PostgreSQL**
2. Free for 90 days, then ~$6/month (or downgrade/delete later)
3. Copy the **Internal Database URL** once it's created

### 3. Create the web service
1. **New** → **Web Service** → connect your repo
2. **Build command:** `npm run build`
3. **Start command:** `npm start`
4. Add the same environment variables as the Railway list above, but set
   `DATABASE_URL` to the Internal Database URL from step 2, and use your
   Render URL (e.g. `https://vibes.onrender.com`) for `FRONTEND_URL`,
   `IMAGE_BASE_URL`, and `SPOTIFY_REDIRECT_URI`

### 4. Run the migration
Render's dashboard → your database → **Connect** → **PSQL Command** gives you
a one-click shell. Run:
```sql
\i backend/db/schema.sql
```
Or, from your own machine with `DATABASE_URL` set to the **External**
connection string:
```bash
DATABASE_URL="postgresql://...external..." npm run db:migrate
```

### 5. Note on free tier
Render's free web services spin down after 15 minutes of inactivity and take
~30 seconds to wake back up on the next request. Fine for testing, not great
for a live link people click from social media — upgrade to the $7/month
"Starter" tier to avoid that, or use Railway instead.

---

## Moving to your IONOS VPS later

Nothing about the app changes — only the environment variables and how it's
started/served:

| | Cloud (Railway/Render) | IONOS VPS |
|---|---|---|
| Database | Managed Postgres (`DATABASE_URL`) | Self-hosted Postgres (`DB_HOST`, `DB_USER`, etc.) |
| Frontend | Served by Express from `frontend/dist` | Served by Nginx from `frontend/dist` |
| Process manager | Handled by the platform | PM2 (`scripts/deploy.sh`) |
| SSL | Automatic | Let's Encrypt via certbot |
| HiDrive / Spotify / SMTP | Same `.env` values | Same `.env` values |

When the VPS is ready, just follow the main `README.md` — same codebase,
different `.env` and deploy scripts. You can run both at once during the
transition and switch your DNS over when ready.
