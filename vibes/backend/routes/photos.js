const router  = require('express').Router();
const multer  = require('multer');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { TIER_LIMITS } = require('../middleware/tiers');
const { uploadImage, deleteImage, streamImage } = require('../middleware/hidrive');

// Memory storage — we process with sharp before sending to HiDrive
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/'))
      return cb(new Error('Only image files allowed'));
    cb(null, true);
  },
});

// GET /api/images/:userId/:filename — proxy image from HiDrive
router.get('/:userId/:filename', async (req, res) => {
  try {
    await streamImage(req.params.userId, req.params.filename, res);
  } catch {
    res.status(404).json({ error: 'Image not found' });
  }
});

// GET /api/photos — get own photos
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, url, position FROM photos WHERE user_id = $1 ORDER BY position, created_at',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/photos — upload a photo
router.post('/', auth, upload.single('photo'), async (req, res) => {
  try {
    const limits = TIER_LIMITS[req.user.tier] || TIER_LIMITS.free;

    const { rows: existing } = await pool.query(
      'SELECT COUNT(*) FROM photos WHERE user_id = $1', [req.user.id]
    );
    if (parseInt(existing[0].count) >= limits.maxPhotos)
      return res.status(403).json({ error: `Photo limit (${limits.maxPhotos}) reached for your plan.` });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const url = await uploadImage(req.file.buffer, req.file.originalname, req.user.id);

    const { rows } = await pool.query(
      'INSERT INTO photos (user_id, url, filename, position) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, url, req.file.originalname, parseInt(existing[0].count)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// DELETE /api/photos/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT url FROM photos WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Photo not found' });

    await deleteImage(rows[0].url);
    await pool.query('DELETE FROM photos WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
