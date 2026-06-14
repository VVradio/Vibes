const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// GET /api/profile/:username — public profile (no auth needed)
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.tier,
              p.display_name, p.bio, p.avatar_url, p.youtube_url,
              p.aura_from, p.aura_to, p.aura_name
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.username = $1`,
      [username.toLowerCase()]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Profile not found' });

    const profile = rows[0];

    // Links
    const links = await pool.query(
      `SELECT id, label, url, icon, position
       FROM links WHERE user_id = $1 ORDER BY position, created_at`,
      [profile.id]
    );

    // Photos
    const photos = await pool.query(
      `SELECT id, url, position
       FROM photos WHERE user_id = $1 ORDER BY position, created_at`,
      [profile.id]
    );

    // Record page view (fire-and-forget)
    pool.query(
      'INSERT INTO page_views (user_id, referrer) VALUES ($1, $2)',
      [profile.id, req.headers.referer || null]
    ).catch(() => {});

    res.json({
      username:    profile.username,
      displayName: profile.display_name,
      bio:         profile.bio,
      avatarUrl:   profile.avatar_url,
      youtubeUrl:  profile.youtube_url,
      tier:        profile.tier,
      aura: {
        name: profile.aura_name,
        from: profile.aura_from,
        to:   profile.aura_to,
      },
      links:  links.rows,
      photos: photos.rows.map(p => p.url),
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/profile — update own profile (auth required)
router.put('/', auth, async (req, res) => {
  try {
    const { displayName, bio, avatarUrl, youtubeUrl, aura } = req.body;

    await pool.query(
      `UPDATE profiles SET
         display_name = COALESCE($1, display_name),
         bio          = COALESCE($2, bio),
         avatar_url   = COALESCE($3, avatar_url),
         youtube_url  = $4,
         aura_from    = COALESCE($5, aura_from),
         aura_to      = COALESCE($6, aura_to),
         aura_name    = COALESCE($7, aura_name)
       WHERE user_id = $8`,
      [
        displayName || null,
        bio || null,
        avatarUrl || null,
        youtubeUrl || null,
        aura?.from || null,
        aura?.to   || null,
        aura?.name || null,
        req.user.id,
      ]
    );

    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
