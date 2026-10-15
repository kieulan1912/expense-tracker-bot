const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMonthlyReport, createChartUrl, formatBudgetStatus } = require('../src/report_service');

const rows = [
  { transaction_type: 'income', category: 'Lương', total: 10_000_000 },
  { transaction_type: 'expense', category: 'Ăn uống', total: 2_000_000 },
];

test('báo cáo tính đúng thu chi và số dư', () => {
  const text = formatMonthlyReport(rows, 10, 2026);
  assert.match(text, /Tổng thu: 10\.000\.000 VNĐ/);
  assert.match(text, /Tổng chi: 2\.000\.000 VNĐ/);
  assert.match(text, /Số dư: 8\.000\.000 VNĐ/);
});

test('chart chỉ được tạo khi có khoản chi', () => {
  assert.match(createChartUrl(rows, 10, 2026), /^https:\/\/quickchart\.io\/chart/);
  assert.equal(createChartUrl(rows.slice(0, 1), 10, 2026), null);
});

test('ngân sách dùng số ngày còn lại', () => {
  const text = formatBudgetStatus(
    [{ category_id: null, amount: 3_100_000, spent: 0 }],
    { year: 2026, month: 10, day: 1 },
  );
  assert.match(text, /100\.000 VNĐ\/ngày/);
});
