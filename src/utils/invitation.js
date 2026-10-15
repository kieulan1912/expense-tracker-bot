const crypto = require('node:crypto');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createInvitationCode() {
  const bytes = crypto.randomBytes(8);
  let value = '';
  for (const byte of bytes) value += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `GD-${value}`;
}

function hashInvitationCode(code) {
  return crypto
    .createHash('sha256')
    .update(code.trim().toUpperCase())
    .digest('hex');
}

module.exports = { createInvitationCode, hashInvitationCode };
