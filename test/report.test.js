const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMonthlyReport,
  formatDailyReport,
  selectDailyReminder,
  createChartUrl,
  formatBudgetStatus,
} = require('../src/domain/services/report_service');

const rows = [
  { transaction_type: 'income', category: 'Lương', total: 10_000_000 },
  { transaction_type: 'expense', category: 'Ăn uống', total: 2_000_000 },
];

test('báo cáo tách chênh lệch thu chi và ngân sách còn lại', () => {
  const text = formatMonthlyReport(rows, 10, 2026, 'Gia đình', [
    { category_id: null, amount: 10_000_000, spent: 2_000_000 },
    { category_id: 1, amount: 3_000_000, spent: 2_000_000 },
  ], { day: 16, month: 10, year: 2026 });
  assert.match(text, /BÁO CÁO THÁNG 10\/2026/);
  assert.match(text, /Tính đến ngày 16\/10\/2026/);
  assert.match(text, /Tổng thu tháng 10\/2026: 10\.000\.000 VNĐ/);
  assert.match(text, /Tổng tiền đã chi: 2\.000\.000 VNĐ/);
  assert.match(text, /Tổng chi tháng 10\/2026: 2\.000\.000 VNĐ/);
  assert.match(text, /Chênh lệch thu–chi: 8\.000\.000 VNĐ/);
  assert.match(text, /Ngân sách tháng: 10\.000\.000 VNĐ/);
  assert.match(text, /Ngân sách còn lại: 8\.000\.000 VNĐ/);
  assert.match(text, /Đã sử dụng: 20%/);
  assert.doesNotMatch(text, /13\.000\.000 VNĐ/);
});

test('báo cáo không dùng ngân sách danh mục làm ngân sách tổng', () => {
  const text = formatMonthlyReport(rows, 10, 2026, '', [
    { category_id: 1, amount: 3_000_000, spent: 2_000_000 },
  ]);
  assert.doesNotMatch(text, /Số dư:/);
  assert.doesNotMatch(text, /Ngân sách tháng:/);
});

test('báo cáo hiển thị số vượt ngân sách', () => {
  const text = formatMonthlyReport(rows, 10, 2026, '', [
    { category_id: null, amount: 1_500_000, spent: 2_000_000 },
  ]);
  assert.match(text, /Vượt ngân sách: 500\.000 VNĐ/);
  assert.match(text, /Đã sử dụng: 133,3%/);
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

test('tổng kết hằng ngày hiển thị thu chi và lời nhắc', () => {
  const dateParts = { year: 2026, month: 10, day: 16 };
  const reminder = selectDailyReminder('funny', dateParts, 12345, true);
  const text = formatDailyReport(rows, dateParts, 'Gia đình', reminder);

  assert.match(text, /TỔNG KẾT HÔM NAY · 16\/10\/2026/);
  assert.match(text, /Tổng thu hôm nay: 10\.000\.000 VNĐ/);
  assert.match(text, /Tổng chi hôm nay: 2\.000\.000 VNĐ/);
  assert.match(text, /💬 /);
  assert.match(text, /Ghi nhanh: \/chi ăn tối 50k/);
});

test('ngày chưa có dữ liệu vẫn nhắc user kiểm tra giao dịch', () => {
  const dateParts = { year: 2026, month: 10, day: 16 };
  const reminder = selectDailyReminder('funny', dateParts, 12345, false);
  const text = formatDailyReport([], dateParts, 'Sổ cá nhân', reminder);

  assert.match(text, /Chưa có giao dịch nào được ghi trong ngày/);
  assert.match(text, /💬 /);
});
