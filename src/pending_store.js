const TTL_MS = 10 * 60 * 1000;
const pending = new Map();

function createPending(userId, payload) {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  pending.set(token, { userId: String(userId), payload, expiresAt: Date.now() + TTL_MS });
  return token;
}

function consumePending(token, userId) {
  const entry = pending.get(token);
  if (!entry || entry.userId !== String(userId) || entry.expiresAt < Date.now()) return null;
  pending.delete(token);
  return entry.payload;
}

function cancelPending(token, userId) {
  const entry = pending.get(token);
  if (!entry || entry.userId !== String(userId)) return false;
  pending.delete(token);
  return true;
}

module.exports = { createPending, consumePending, cancelPending };
