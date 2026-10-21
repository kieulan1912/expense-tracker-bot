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

test('validateResult chuẩn hóa nhiều điều kiện tìm kiếm AI', () => {
  const result = validateResult({
    intent: 'SEARCH_REQ', reply: '', confidence: 1, needs_confirmation: false,
    occurred_at: null, limit: 15, items: [],
    filters: {
      keyword: 'mua sữa cho con', transaction_type: 'expense', category_id: 1,
      amount_min: 100_000, amount_max: 500_000,
      date_from: '2026-10-01', date_to: '2026-10-31', created_by: 'Lân',
    },
  });
  assert.deepEqual(result.filters, {
    keyword: 'mua sữa cho con', transactionType: 'expense', categoryId: 1,
    amountMin: 100_000, amountMax: 500_000,
    dateFrom: '2026-10-01', dateTo: '2026-10-31', createdBy: 'Lân',
  });
  assert.equal(result.limit, 15);
});

test('validateResult hiểu trả hết nợ và hủy khoản chi', () => {
  const debt = validateResult({
    intent: 'DEBT_PAY', reply: '', confidence: 1, needs_confirmation: true,
    occurred_at: null, limit: null,
    items: [{
      amount: 0, category_id: 99, description: 'Nam trả hết nợ',
      person_name: 'Nam', debt_type: 1, target_id: null,
      settle_full: true, adjustment_amount: null,
    }],
  });
  assert.equal(debt.items[0].settleFull, true);
  assert.equal(debt.items[0].personName, 'Nam');

  const cancellation = validateResult({
    intent: 'TRANSACTION_CANCEL', reply: '', confidence: 1, needs_confirmation: true,
    occurred_at: null, limit: null,
    items: [{
      amount: 0, category_id: 7, description: 'mẹ không nhận tiền',
      person_name: 'mẹ', debt_type: null, target_id: 12,
      settle_full: false, adjustment_amount: null,
    }],
  });
  assert.equal(cancellation.items[0].targetId, 12);
});
