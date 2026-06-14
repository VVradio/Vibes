const nodemailer = require('nodemailer');

let transporter = null;
let warned = false;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    if (!warned) {
      console.warn('✉  SMTP not configured — milestone emails are disabled. Set SMTP_* in .env to enable.');
      warned = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Send an email. Returns true on success, false if SMTP isn't configured
 * or sending failed (never throws — email is best-effort).
 */
async function sendMail({ to, subject, html, text }) {
  if (!to) return false;
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: text || undefined,
      html,
    });
    return true;
  } catch (err) {
    console.error('Email send error (non-fatal):', err.message);
    return false;
  }
}

module.exports = { sendMail };
