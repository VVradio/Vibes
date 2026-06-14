const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/settings — current notification settings
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT email, notify_milestones FROM users WHERE id = $1', [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({
      email: rows[0].email || '',
      notifyMilestones: rows[0].notify_milestones,
    });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings — update notification email / preferences
router.put('/', auth, async (req, res) => {
  try {
    const { email, notifyMilestones } = req.body;

    if (email && !EMAIL_RE.test(email))
      return res.status(400).json({ error: 'That email address doesn\'t look valid.' });

    await pool.query(
      'UPDATE users SET email = $1, notify_milestones = $2 WHERE id = $3',
      [email || null, notifyMilestones !== false, req.user.id]
    );

    res.json({ email: email || '', notifyMilestones: notifyMilestones !== false });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already in use on another account.' });
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
