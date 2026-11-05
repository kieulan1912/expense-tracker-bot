const { detectCategoryId, normalizeForCategory } = require('../../utils/category');
const { getCurrentMonth } = require('../../utils/month');

const monthNames = Object.freeze({
  mot: 1, hai: 2, ba: 3, tu: 4, nam: 5, sau: 6,
  bay: 7, tam: 8, chin: 9, muoi: 10,
  'muoi mot': 11, 'muoi hai': 12,
});

function previousMonth(month, year) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function resolvePeriod(normalized, timezone, lastReportPeriod = null) {
  const current = getCurrentMonth(timezone);
  let period = { ...current };
  if (/thang truoc/.test(normalized)) period = previousMonth(current.month, current.year);
  else if (/(thang nay|hien tai)/.test(normalized)) period = current;
  else if (/thang do|thang vua noi|bao cao tiep/.test(normalized) && lastReportPeriod) period = lastReportPeriod;
  else {
    const numeric = normalized.match(/thang\s+(1[0-2]|0?[1-9])(?:\s*[/-]\s*(20\d{2}))?/);
    const word = normalized.match(/thang\s+(muoi mot|muoi hai|mot|hai|ba|tu|nam|sau|bay|tam|chin|muoi)/);
    if (numeric) period = { month: Number(numeric[1]), year: Number(numeric[2] || current.year) };
    else if (word) period = { month: monthNames[word[1]], year: current.year };
    const standaloneYear = normalized.match(/\b(20\d{2})\b/);
    if (standaloneYear) period.year = Number(standaloneYear[1]);
  }
  return period;
}

function parseSpendingInsight(text, timezone, lastReportPeriod = null) {
  const normalized = normalizeForCategory(text);
  const asksWhy = /(tai sao|vi sao|do dau|nguyen nhan|chi nhieu|ton nhieu|tang manh|tang cao|bat thuong|phan tich chi)/.test(normalized);
  const childScope = /\b(cho con|cua con|con nho|em be|tre em|be yeu|tien sua|bim sua|hoc phi cua be)\b/.test(normalized);
  const asksChildBreakdown = childScope
    && /(bao nhieu|the nao|gom nhung gi|chi tieu|ton kem|phan tich)/.test(normalized);
  if (!asksWhy && !asksChildBreakdown) return null;
  return {
    intent: 'SPENDING_INSIGHT', confidence: 1, needsConfirmation: false, items: [],
    reportPeriod: {
      ...resolvePeriod(normalized, timezone, lastReportPeriod),
      transactionType: 'expense',
      categoryId: null,
    },
    insightScope: childScope ? 'child' : 'all',
    reply: '',
  };
}

function parseReportPeriod(text, timezone, lastReportPeriod = null) {
  const normalized = normalizeForCategory(text);
  if (!/(bao cao|tong thu|tong chi|da chi|thu chi)/.test(normalized)) return null;
  const period = resolvePeriod(normalized, timezone, lastReportPeriod);
  const transactionType = /thu chi/.test(normalized)
    ? null
    : /tong thu|khoan thu|thu nhap/.test(normalized)
      ? 'income'
      : /tong chi|khoan chi|da chi|chi tieu/.test(normalized) ? 'expense' : null;
  const detectedCategory = detectCategoryId(normalized, transactionType || 'expense');
  return {
    intent: 'REPORT_REQ', confidence: 1, needsConfirmation: false, items: [],
    reportPeriod: {
      ...period,
      transactionType,
      categoryId: detectedCategory === 99 ? null : detectedCategory,
    },
    reply: '',
  };
}

module.exports = { parseReportPeriod, parseSpendingInsight };
