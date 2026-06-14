const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const { sendMail } = require('../middleware/mailer');

const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI; // e.g. https://vibes.yourdomain.com/api/presave/spotify/callback
const FRONTEND_URL          = process.env.FRONTEND_URL || 'http://localhost:5173';

const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

// ── Helpers ───────────────────────────────────────────────────────────────────
function shapeCampaign(row, presaveCount = 0) {
  if (!row) return null;
  return {
    title:         row.title,
    artistName:    row.artist_name,
    coverUrl:      row.cover_url,
    releaseDate:   row.release_date,
    spotifyId:     row.spotify_id,
    spotifyType:   row.spotify_type,
    appleMusicUrl: row.apple_music_url,
    active:        row.active,
    presaveCount,
  };
}

async function getCountFor(campaignId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS total FROM presave_actions WHERE campaign_id = $1', [campaignId]
  );
  return parseInt(rows[0].total);
}

/**
 * After recording a presave, check whether the campaign just crossed a
 * milestone (10, 25, 50, 100, ...) and email the creator if so.
 * Best-effort — never throws.
 */
async function checkMilestone(campaign) {
  try {
    const count = await getCountFor(campaign.id);
    const lastMilestone = campaign.last_milestone || 0;
    const crossed = MILESTONES.filter(m => m <= count && m > lastMilestone).pop();
    if (!crossed) return;

    await pool.query('UPDATE presave_campaigns SET last_milestone = $1 WHERE id = $2', [crossed, campaign.id]);

    const { rows } = await pool.query(
      'SELECT username, email, notify_milestones FROM users WHERE id = $1', [campaign.user_id]
    );
    const user = rows[0];
    if (!user || !user.email || !user.notify_milestones) return;

    const title = campaign.title || 'your release';
    await sendMail({
      to: user.email,
      subject: `🎉 ${crossed.toLocaleString()} presaves for "${title}"!`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#FF8C42">🎉 Milestone reached!</h2>
          <p><strong>${title}</strong> just hit <strong>${crossed.toLocaleString()} presaves</strong> on your Vibes page.</p>
          <p>Total so far: <strong>${count.toLocaleString()}</strong></p>
          <p>Keep sharing your link to build momentum before release day:</p>
          <p><a href="${FRONTEND_URL}/@${user.username}" style="color:#00A8E8">${FRONTEND_URL}/@${user.username}</a></p>
          <p style="color:#999;font-size:.8rem;margin-top:2rem">
            You can turn off these emails anytime in your Vibes account settings.
          </p>
        </div>`,
      text: `${title} just hit ${crossed.toLocaleString()} presaves! Total so far: ${count.toLocaleString()}. ${FRONTEND_URL}/@${user.username}`,
    });
  } catch (err) {
    console.error('Milestone check error (non-fatal):', err.message);
  }
}

// ── GET /api/presave — own campaign (auth) ──────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM presave_campaigns WHERE user_id = $1', [req.user.id]
    );
    if (!rows[0]) return res.json(null);
    const count = await getCountFor(rows[0].id);
    res.json(shapeCampaign(rows[0], count));
  } catch (err) {
    console.error('Get presave error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/presave — create/update own campaign (auth, Pro+ only) ──────────
router.put('/', auth, async (req, res) => {
  try {
    if (req.user.tier === 'free')
      return res.status(403).json({ error: 'Presave campaigns are available on Pro and Creator plans.' });

    const {
      title, artistName, coverUrl, releaseDate,
      spotifyId, spotifyType, appleMusicUrl, active,
    } = req.body;

    if (spotifyType && !['track', 'album'].includes(spotifyType))
      return res.status(400).json({ error: "spotifyType must be 'track' or 'album'" });

    const { rows } = await pool.query(
      `INSERT INTO presave_campaigns
         (user_id, title, artist_name, cover_url, release_date, spotify_id, spotify_type, apple_music_url, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id) DO UPDATE SET
         title           = EXCLUDED.title,
         artist_name     = EXCLUDED.artist_name,
         cover_url       = EXCLUDED.cover_url,
         release_date    = EXCLUDED.release_date,
         spotify_id      = EXCLUDED.spotify_id,
         spotify_type    = EXCLUDED.spotify_type,
         apple_music_url = EXCLUDED.apple_music_url,
         active          = EXCLUDED.active
       RETURNING *`,
      [
        req.user.id,
        title || null,
        artistName || null,
        coverUrl || null,
        releaseDate || null,
        spotifyId || null,
        spotifyType || 'track',
        appleMusicUrl || null,
        active !== false,
      ]
    );

    const count = await getCountFor(rows[0].id);
    res.json(shapeCampaign(rows[0], count));
  } catch (err) {
    console.error('Update presave error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/presave/spotify-lookup — auto-fill from a pasted Spotify link ───
// Must be defined BEFORE /:username so it isn't swallowed by that route.
router.get('/spotify-lookup', auth, async (req, res) => {
  try {
    if (req.user.tier === 'free')
      return res.status(403).json({ error: 'Presave campaigns are available on Pro and Creator plans.' });

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'A Spotify link is required.' });

    const m = url.match(/open\.spotify\.com\/(track|album)\/([a-zA-Z0-9]+)/);
    if (!m) return res.status(400).json({ error: 'That doesn\'t look like a Spotify track or album link.' });

    const [, type, id] = m;

    const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (!oembedRes.ok) throw new Error('Spotify lookup failed');
    const data = await oembedRes.json();

    res.json({
      spotifyId:   id,
      spotifyType: type,
      title:       data.title || '',
      coverUrl:    data.thumbnail_url || '',
    });
  } catch (err) {
    console.error('Spotify lookup error:', err);
    res.status(502).json({ error: "Couldn't fetch info from Spotify — you can fill these in manually." });
  }
});

// ── GET /api/presave/spotify/login/:username — start OAuth flow ─────────────
// Must be defined BEFORE /:username so it isn't swallowed by that route.
router.get('/spotify/login/:username', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
    return res.redirect(`${FRONTEND_URL}/@${req.params.username}?presave=unavailable`);
  }
  const params = new URLSearchParams({
    client_id:     SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  SPOTIFY_REDIRECT_URI,
    scope:         'user-library-modify',
    state:         req.params.username.toLowerCase(),
    show_dialog:   'true',
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// ── GET /api/presave/spotify/callback — exchange code, save track, record ───
router.get('/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const username = (state || '').toLowerCase();

  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}/@${username}?presave=cancelled`);
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token returned');
    const accessToken = tokenData.access_token;

    // 2. Look up the campaign for this user
    const { rows: userRows } = await pool.query(
      'SELECT id FROM users WHERE username = $1', [username]
    );
    if (!userRows[0]) return res.redirect(`${FRONTEND_URL}/?presave=error`);

    const { rows: campaignRows } = await pool.query(
      'SELECT * FROM presave_campaigns WHERE user_id = $1 AND active = true', [userRows[0].id]
    );
    const campaign = campaignRows[0];
    if (!campaign || !campaign.spotify_id) {
      return res.redirect(`${FRONTEND_URL}/@${username}?presave=error`);
    }

    // 3. Save the track/album to the fan's Spotify library
    const endpoint = campaign.spotify_type === 'album' ? 'albums' : 'tracks';
    await fetch(`https://api.spotify.com/v1/me/${endpoint}?ids=${campaign.spotify_id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 4. Identify the fan (for de-duplication) and record the presave
    let spotifyUserId = null;
    try {
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const me = await meRes.json();
      spotifyUserId = me.id || null;
    } catch { /* non-fatal */ }

    if (spotifyUserId) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM presave_actions
         WHERE campaign_id = $1 AND platform = 'spotify' AND external_id = $2`,
        [campaign.id, spotifyUserId]
      );
      if (!existing[0]) {
        await pool.query(
          `INSERT INTO presave_actions (campaign_id, platform, external_id) VALUES ($1,'spotify',$2)`,
          [campaign.id, spotifyUserId]
        );
        await checkMilestone(campaign);
      }
    } else {
      await pool.query(
        `INSERT INTO presave_actions (campaign_id, platform) VALUES ($1,'spotify')`,
        [campaign.id]
      );
      await checkMilestone(campaign);
    }

    res.redirect(`${FRONTEND_URL}/@${username}?presave=success`);
  } catch (err) {
    console.error('Spotify presave error:', err);
    res.redirect(`${FRONTEND_URL}/@${username}?presave=error`);
  }
});

// ── POST /api/presave/:username/apple-click — track Apple Music pre-adds ────
router.post('/:username/apple-click', async (req, res) => {
  try {
    const { rows: userRows } = await pool.query(
      'SELECT id FROM users WHERE username = $1', [req.params.username.toLowerCase()]
    );
    if (!userRows[0]) return res.status(404).json({ error: 'User not found' });

    const { rows: campaignRows } = await pool.query(
      'SELECT * FROM presave_campaigns WHERE user_id = $1 AND active = true', [userRows[0].id]
    );
    if (!campaignRows[0]) return res.status(404).json({ error: 'No active campaign' });

    await pool.query(
      `INSERT INTO presave_actions (campaign_id, platform) VALUES ($1,'apple')`,
      [campaignRows[0].id]
    );
    await checkMilestone(campaignRows[0]);
    res.json({ message: 'Recorded' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/presave/:username — public campaign (no auth) ──────────────────
// Must be defined LAST so it doesn't shadow the routes above.
router.get('/:username', async (req, res) => {
  try {
    const { rows: userRows } = await pool.query(
      'SELECT id FROM users WHERE username = $1', [req.params.username.toLowerCase()]
    );
    if (!userRows[0]) return res.status(404).json({ error: 'User not found' });

    const { rows } = await pool.query(
      'SELECT * FROM presave_campaigns WHERE user_id = $1 AND active = true', [userRows[0].id]
    );
    if (!rows[0]) return res.json(null);

    const count = await getCountFor(rows[0].id);
    res.json(shapeCampaign(rows[0], count));
  } catch (err) {
    console.error('Get public presave error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
