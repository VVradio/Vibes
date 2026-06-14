const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const { TIER_LIMITS } = require('../middleware/tiers');

// GET /api/links — get own links
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, label, url, icon, position FROM links WHERE user_id = $1 ORDER BY position, created_at',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/links — add a link
router.post('/', auth, async (req, res) => {
  try {
    const limits = TIER_LIMITS[req.user.tier] || TIER_LIMITS.free;

    if (limits.maxLinks) {
      const { rows } = await pool.query(
        'SELECT COUNT(*) FROM links WHERE user_id = $1', [req.user.id]
      );
      if (parseInt(rows[0].count) >= limits.maxLinks)
        return res.status(403).json({ error: `Link limit reached (${limits.maxLinks}) for your plan. Upgrade to add more.` });
    }

    const { label, url, icon = '🔗', position = 0 } = req.body;
    if (!label || !url) return res.status(400).json({ error: 'Label and URL required' });

    const { rows } = await pool.query(
      'INSERT INTO links (user_id, label, url, icon, position) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, label, url, icon, position]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/links/:id — update a link
router.put('/:id', auth, async (req, res) => {
  try {
    const { label, url, icon, position } = req.body;
    const { rows } = await pool.query(
      `UPDATE links SET
         label    = COALESCE($1, label),
         url      = COALESCE($2, url),
         icon     = COALESCE($3, icon),
         position = COALESCE($4, position)
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [label, url, icon, position, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Link not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/links/reorder — bulk reorder
router.put('/reorder/bulk', auth, async (req, res) => {
  try {
    const { order } = req.body; // [{ id, position }]
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
    for (const item of order) {
      await pool.query(
        'UPDATE links SET position = $1 WHERE id = $2 AND user_id = $3',
        [item.position, item.id, req.user.id]
      );
    }
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/links/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM links WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/links/:id/click — record a click
router.post('/:id/click', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT user_id FROM links WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Link not found' });
    await pool.query(
      'INSERT INTO link_clicks (link_id, user_id) VALUES ($1, $2)',
      [req.params.id, rows[0].user_id]
    );
    res.json({ message: 'Click recorded' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
