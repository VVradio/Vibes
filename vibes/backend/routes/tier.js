const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// POST /api/tier/upgrade — simulate upgrade (wire Stripe here in production)
router.post('/upgrade', auth, async (req, res) => {
  try {
    const { tier } = req.body;
    if (!['free','pro','merch'].includes(tier))
      return res.status(400).json({ error: 'Invalid tier' });

    await pool.query('UPDATE users SET tier = $1 WHERE id = $2', [tier, req.user.id]);

    // Return a refreshed token with new tier
    const jwt = require('jsonwebtoken');
    const { rows } = await pool.query(
      'SELECT id, username, tier FROM users WHERE id = $1', [req.user.id]
    );
    const user = rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, tier: user.tier },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.json({ message: `Upgraded to ${tier}`, token, tier });
  } catch (err) {
    console.error('Tier upgrade error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
