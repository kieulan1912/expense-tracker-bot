const { getCategoryName } = require('../../utils/category');

const INTENTS = Object.freeze([
  'EXPENSE',
  'INCOME',
  'DEBT_ADD',
  'DEBT_PAY',
  'DEBT_CANCEL',
  'TRANSACTION_ADJUST',
  'TRANSACTION_CANCEL',
  'BUDGET_SET',
  'REPORT_REQ',
  'SPENDING_INSIGHT',
  'HISTORY_REQ',
  'SEARCH_REQ',
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
    const allowsZeroAmount = (raw.intent === 'DEBT_PAY' && item.settle_full === true)
      || ['DEBT_CANCEL', 'TRANSACTION_CANCEL'].includes(raw.intent);
    if (!Number.isSafeInteger(amount) || (allowsZeroAmount ? amount < 0 : amount <= 0)
      || !allowedCategories.has(categoryId)) {
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
      targetId: Number.isSafeInteger(Number(item.target_id)) && Number(item.target_id) > 0
        ? Number(item.target_id)
        : null,
      settleFull: Boolean(item.settle_full),
      adjustmentAmount: Number.isSafeInteger(Number(item.adjustment_amount))
        && Number(item.adjustment_amount) > 0
        ? Number(item.adjustment_amount)
        : null,
      occurredAt: raw.occurred_at && !Number.isNaN(Date.parse(raw.occurred_at))
        ? new Date(raw.occurred_at).toISOString()
        : null,
    };
  });
  const rawFilters = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
  const transactionType = ['expense', 'income'].includes(rawFilters.transaction_type)
    ? rawFilters.transaction_type
    : null;
  const categoryId = Number(rawFilters.category_id);
  const validCategoryIds = new Set([1, 2, 3, 4, 5, 6, 7, 91, 92, 93, 94, 99]);
  const normalizeAmount = (value) => {
    if (value === null || value === undefined) return null;
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  };
  const normalizeDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? value
      : null;
  };
  const filters = {
    keyword: String(rawFilters.keyword || '').trim().slice(0, 120),
    transactionType,
    categoryId: validCategoryIds.has(categoryId) ? categoryId : null,
    amountMin: normalizeAmount(rawFilters.amount_min),
    amountMax: normalizeAmount(rawFilters.amount_max),
    dateFrom: normalizeDate(rawFilters.date_from),
    dateTo: normalizeDate(rawFilters.date_to),
    createdBy: String(rawFilters.created_by || '').trim().slice(0, 80),
  };
  if (filters.amountMin && filters.amountMax && filters.amountMin > filters.amountMax) {
    throw new Error('Gemini trả về khoảng tiền không hợp lệ');
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw new Error('Gemini trả về khoảng ngày không hợp lệ');
  }
  const reportMonth = raw.report_month === null || raw.report_month === undefined
    ? null
    : Number(raw.report_month);
  const reportYear = raw.report_year === null || raw.report_year === undefined
    ? null
    : Number(raw.report_year);
  const reportType = ['expense', 'income'].includes(raw.report_type)
    ? raw.report_type
    : null;
  const reportCategoryId = raw.report_category_id === null || raw.report_category_id === undefined
    ? null
    : Number(raw.report_category_id);
  const reportCategoryIds = new Set([1, 2, 3, 4, 5, 6, 7, 91, 92, 93, 94, 99]);
  if ((reportMonth !== null && (!Number.isInteger(reportMonth) || reportMonth < 1 || reportMonth > 12))
    || (reportYear !== null && (!Number.isInteger(reportYear) || reportYear < 2000 || reportYear > 9999))) {
    throw new Error('Gemini trả về kỳ báo cáo không hợp lệ');
  }
  if (reportCategoryId !== null
    && !reportCategoryIds.has(reportCategoryId)) {
    throw new Error('Gemini trả về danh mục báo cáo không hợp lệ');
  }
  const normalizedReportCategoryId = reportCategoryIds.has(reportCategoryId)
    ? reportCategoryId
    : null;
  const normalizedReportType = normalizedReportCategoryId >= 91
    && normalizedReportCategoryId <= 94
    ? 'income'
    : normalizedReportCategoryId !== null && normalizedReportCategoryId !== 99
      ? 'expense'
      : reportType;
  return {
    intent: raw.intent,
    reply: String(raw.reply || '').trim().slice(0, 180),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    needsConfirmation: Boolean(raw.needs_confirmation),
    limit: raw.limit === null || raw.limit === undefined
      ? null
      : Math.max(1, Math.min(20, Number(raw.limit) || 10)),
    filters,
    reportPeriod: {
      month: reportMonth,
      year: reportYear,
      transactionType: normalizedReportType,
      categoryId: normalizedReportCategoryId,
    },
    insightScope: raw.insight_scope === 'child' ? 'child' : 'all',
    items,
  };
}

module.exports = { INTENTS, validateResult };
