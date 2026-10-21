const test = require('node:test');
const assert = require('node:assert/strict');
const { createPendingStore } = require('../src/infrastructure/stores/pending_store');

const {
  createPending,
  consumePending,
  cancelPending,
  setInput,
  consumeInput,
  clearInput,
} = createPendingStore();

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

test('input theo user chỉ được dùng một lần', () => {
  setInput(1, { kind: 'debt_payment_amount', debtId: 12 });
  assert.equal(consumeInput(2), null);
  assert.deepEqual(consumeInput(1), { kind: 'debt_payment_amount', debtId: 12 });
  assert.equal(consumeInput(1), null);
  setInput(1, { value: 1 });
  assert.equal(clearInput(1), true);
  assert.equal(consumeInput(1), null);
});
