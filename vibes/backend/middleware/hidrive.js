const { createClient } = require('webdav');
const sharp = require('sharp');
const path  = require('path');

function getClient() {
  return createClient(process.env.HIDRIVE_URL, {
    username: process.env.HIDRIVE_USER,
    password: process.env.HIDRIVE_PASS,
  });
}

const BASE = process.env.HIDRIVE_BASE_PATH || '/vibes-uploads';

/**
 * Upload a buffer to HiDrive, resizing/optimising first.
 * Returns the public URL path.
 */
async function uploadImage(buffer, originalName, userId) {
  const client = getClient();

  // Ensure user folder exists
  const folder = `${BASE}/${userId}`;
  try { await client.createDirectory(folder, { recursive: true }); } catch {}

  // Resize + convert to webp for efficiency
  const optimised = await sharp(buffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const filename = `${Date.now()}-${path.parse(originalName).name}.webp`;
  const remotePath = `${folder}/${filename}`;

  await client.putFileContents(remotePath, optimised, { overwrite: true });

  // Return the URL that our API proxies back to the client
  return `${process.env.IMAGE_BASE_URL}/${userId}/${filename}`;
}

/**
 * Delete an image from HiDrive by its stored URL.
 */
async function deleteImage(imageUrl) {
  try {
    const client = getClient();
    // Extract path from URL: /api/images/{userId}/{filename}
    const parts = imageUrl.split('/api/images/')[1];
    if (!parts) return;
    const remotePath = `${BASE}/${parts}`;
    await client.deleteFile(remotePath);
  } catch (err) {
    console.error('HiDrive delete error (non-fatal):', err.message);
  }
}

/**
 * Stream an image from HiDrive to the Express response.
 */
async function streamImage(userId, filename, res) {
  const client = getClient();
  const remotePath = `${BASE}/${userId}/${filename}`;
  const stream = client.createReadStream(remotePath);
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  stream.pipe(res);
  stream.on('error', () => res.status(404).json({ error: 'Image not found' }));
}

module.exports = { uploadImage, deleteImage, streamImage };
