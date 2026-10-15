const test = require('node:test');
const assert = require('node:assert/strict');
const { createPending, consumePending, cancelPending } = require('../src/pending_store');

test('pending chỉ được dùng một lần và đúng user', () => {
  const token = createPending(1, { value: 42 });
  assert.equal(consumePending(token, 2), null);
  assert.deepEqual(consumePending(token, 1), { value: 42 });
  assert.equal(consumePending(token, 1), null);
});

test('pending có thể bị hủy', () => {
  const token = createPending(1, {});
  assert.equal(cancelPending(token, 1), true);
  assert.equal(consumePending(token, 1), null);
});
