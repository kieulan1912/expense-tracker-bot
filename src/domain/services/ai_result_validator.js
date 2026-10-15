const { getCategoryName } = require('../../utils/category');

const INTENTS = Object.freeze([
  'EXPENSE',
  'INCOME',
  'DEBT_ADD',
  'DEBT_PAY',
  'BUDGET_SET',
  'REPORT_REQ',
  'HISTORY_REQ',
  'UNKNOWN',
]);

function validateResult(raw) {
  if (!raw || !INTENTS.includes(raw.intent) || !Array.isArray(raw.items)) {
    throw new Error('Gemini trả về dữ liệu không hợp lệ');
  }
  const intentType = raw.intent === 'INCOME' ? 'income' : 'expense';
  const allowedCategories = intentType === 'income'
    ? new Set([91, 92, 93, 94, 99])
    : new Set([1, 2, 3, 4, 5, 6, 7, 99]);
  const items = raw.items.slice(0, 10).map((item) => {
    const amount = Number(item.amount);
    const categoryId = Number(item.category_id);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !allowedCategories.has(categoryId)) {
      throw new Error('Gemini trả về giao dịch không hợp lệ');
    }
    return {
      type: intentType,
      amount,
      categoryId,
      category: getCategoryName(categoryId, intentType),
      description: String(item.description || 'Không có ghi chú').trim().slice(0, 40),
      personName: item.person_name ? String(item.person_name).trim().slice(0, 80) : null,
      debtType: [1, 2].includes(Number(item.debt_type)) ? Number(item.debt_type) : null,
      occurredAt: raw.occurred_at && !Number.isNaN(Date.parse(raw.occurred_at))
        ? new Date(raw.occurred_at).toISOString()
        : null,
    };
  });
  return {
    intent: raw.intent,
    reply: String(raw.reply || '').trim().slice(0, 180),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    needsConfirmation: Boolean(raw.needs_confirmation),
    limit: raw.limit === null || raw.limit === undefined
      ? null
      : Math.max(1, Math.min(20, Number(raw.limit) || 10)),
    items,
  };
}

module.exports = { INTENTS, validateResult };
