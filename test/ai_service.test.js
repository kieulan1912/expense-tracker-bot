process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateResult } = require('../src/domain/services/ai_result_validator');

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

test('validateResult đọc yêu cầu lấy N giao dịch gần nhất', () => {
  const result = validateResult({
    intent: 'HISTORY_REQ',
    reply: '',
    confidence: 0.99,
    needs_confirmation: false,
    occurred_at: null,
    limit: 3,
    items: [],
  });
  assert.equal(result.intent, 'HISTORY_REQ');
  assert.equal(result.limit, 3);
});

test('validateResult giới hạn lịch sử tối đa 20 giao dịch', () => {
  const result = validateResult({
    intent: 'HISTORY_REQ',
    reply: '',
    confidence: 1,
    needs_confirmation: false,
    occurred_at: null,
    limit: 100,
    items: [],
  });
  assert.equal(result.limit, 20);
});
