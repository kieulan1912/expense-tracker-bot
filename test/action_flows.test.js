const test = require('node:test');
const assert = require('node:assert/strict');
const { InputError } = require('../src/domain/errors');
const {
  debtListView,
  requestDebtPaymentConfirmation,
} = require('../src/presentation/telegram/action_flows');

test('danh sách công nợ phân trang và chỉ hiện nút hủy đúng quyền', () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    debt_type: 1,
    person_name: `Người ${index + 1}`,
    remaining_amount: 100_000,
    description: '',
    created_by_user_id: index === 0 ? 10 : 20,
  }));
  const firstPage = debtListView(rows, { userId: 10, role: 'member', page: 0 });
  assert.match(firstPage.text, /Trang 1\/2/);
  const callbacks = firstPage.keyboard.reply_markup.inline_keyboard
    .flat().map((button) => button.callback_data);
  assert.ok(callbacks.includes('debt:cancel:1'));
  assert.ok(!callbacks.includes('debt:cancel:2'));
  assert.ok(callbacks.includes('debt:list:1'));

  const viewer = debtListView(rows, { userId: 10, role: 'viewer', page: 0 });
  const viewerCallbacks = viewer.keyboard.reply_markup.inline_keyboard
    .flat().map((button) => button.callback_data);
  assert.ok(viewerCallbacks.includes('debt:details:1'));
  assert.ok(!viewerCallbacks.includes('debt:partial:1'));
  assert.ok(viewerCallbacks.includes('debt:list:1'));
});

test('không cho xác nhận số tiền trả lớn hơn dư nợ', async () => {
  await assert.rejects(
    requestDebtPaymentConfirmation({ from: { id: 1 } }, {
      debt: {
        id: 12,
        ledger_id: 2,
        debt_type: 1,
        person_name: 'Nam',
        remaining_amount: 100_000,
      },
      amount: 150_000,
      createPending() {},
    }),
    InputError,
  );
});
