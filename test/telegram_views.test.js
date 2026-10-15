const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMonthlyTransactionDetails,
  monthlyReportKeyboard,
  monthlyReportDetailsKeyboard,
} = require('../src/presentation/telegram/views');

test('chi tiết báo cáo phân trang và escape nội dung Telegram HTML', () => {
  const transactions = Array.from({ length: 9 }, (_, index) => ({
    id: index + 1,
    transaction_type: index === 8 ? 'income' : 'expense',
    amount: (index + 1) * 10_000,
    category: index === 8 ? 'Lương & thưởng' : 'Ăn uống',
    description: index === 8 ? '<thưởng quý>' : `Giao dịch ${index + 1}`,
    created_by_name: index === 8 ? 'Lân <Admin>' : 'Thu',
    local_created_at: `2026-10-${String(index + 1).padStart(2, '0')} 08:30:00`,
  }));

  const result = formatMonthlyTransactionDetails(transactions, {
    month: 10,
    year: 2026,
    ledgerName: 'Gia đình & Bạn',
    page: 2,
  });

  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
  assert.match(result.text, /Trang 2\/2 · 9 giao dịch/);
  assert.match(result.text, /#9/);
  assert.doesNotMatch(result.text, /#1\s/);
  assert.match(result.text, /09\/10 08:30/);
  assert.match(result.text, /Gia đình &amp; Bạn/);
  assert.match(result.text, /&lt;thưởng quý&gt;/);
  assert.match(result.text, /Lân &lt;Admin&gt;/);
  assert.ok(result.text.length < 4096);
});

test('nút báo cáo mang đủ ledger, tháng, năm và trang', () => {
  const summary = monthlyReportKeyboard(12, 10, 2026);
  assert.equal(
    summary.reply_markup.inline_keyboard[0][0].callback_data,
    'report:details:12:2026:10:1',
  );

  const details = monthlyReportDetailsKeyboard(12, 10, 2026, 2, 3);
  const callbacks = details.reply_markup.inline_keyboard.flat().map((button) => button.callback_data);
  assert.deepEqual(callbacks, [
    'report:details:12:2026:10:1',
    'report:details:12:2026:10:3',
    'report:summary:12:2026:10',
  ]);
});
