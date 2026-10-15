process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateResult } = require('../src/ai_service');

test('validateResult chuẩn hóa giao dịch AI', () => {
  const result = validateResult({
    intent: 'EXPENSE',
    reply: 'Đã hiểu.',
    confidence: 0.95,
    needs_confirmation: false,
    occurred_at: null,
    items: [{ amount: 50_000, category_id: 1, description: 'phở bò', person_name: null, debt_type: null }],
  });
  assert.equal(result.items[0].type, 'expense');
  assert.equal(result.items[0].category, 'Ăn uống');
  assert.equal(result.confidence, 0.95);
});

test('validateResult từ chối amount và category không hợp lệ', () => {
  assert.throws(() => validateResult({
    intent: 'EXPENSE', reply: '', confidence: 1, needs_confirmation: false,
    occurred_at: null,
    items: [{ amount: -1, category_id: 500, description: 'x', person_name: null, debt_type: null }],
  }));
});
