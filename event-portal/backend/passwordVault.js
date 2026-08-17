const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  // Derives a fixed-length key from whatever secret is set. Falls back to
  // JWT_SECRET if a dedicated key isn't configured, so this works out of
  // the box, but setting PASSWORD_VIEW_KEY separately is recommended.
  const secret = process.env.PASSWORD_VIEW_KEY || process.env.JWT_SECRET || 'change-me';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return null;
  try {
    const data = Buffer.from(payload, 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (err) {
    return null; // e.g. key changed since it was encrypted
  }
}

module.exports = { encrypt, decrypt };
