const test = require('node:test');
const assert = require('node:assert/strict');
const { createScheduler } = require('../src/infrastructure/scheduler/scheduler');

function createTestScheduler() {
  return createScheduler({
    config: { timezone: 'Asia/Ho_Chi_Minh', schedulerEnabled: false },
    finance: {
      getDueRecurring: async () => [],
      markRecurringPrompted: async () => {},
      getDueDebts: async () => [],
      markDebtReminded: async () => {},
      getBudgetStatus: async () => [],
    },
    users: { getReminderUsers: async () => [] },
    transactions: {
      getMonthlySummary: async () => [],
      getDailySummary: async () => [],
    },
  });
}

test('scheduler tính ngày theo timezone cấu hình', () => {
  const scheduler = createTestScheduler();
  const parts = scheduler.localDateParts(new Date('2026-10-14T17:30:00.000Z'));
  assert.deepEqual(parts, {
    year: 2026,
    month: 10,
    day: 15,
    weekday: 'Thu',
  });
});

test('scheduler disabled không tạo timer nền', () => {
  const scheduler = createTestScheduler();
  const stop = scheduler.startScheduler({ sendMessage() {} });
  assert.equal(typeof stop, 'function');
  stop();
});

test('scheduler gửi tổng kết hằng ngày lúc chạy job', async () => {
  const messages = [];
  const dailyCalls = [];
  const scheduler = createScheduler({
    config: { timezone: 'Asia/Ho_Chi_Minh', schedulerEnabled: true },
    finance: {
      getDueRecurring: async () => [],
      markRecurringPrompted: async () => {},
      getDueDebts: async () => [],
      markDebtReminded: async () => {},
      getBudgetStatus: async () => [],
    },
    users: {
      getReminderUsers: async () => [{
        telegram_user_id: 123,
        chat_id: 456,
        timezone: 'Asia/Ho_Chi_Minh',
        personality: 'funny',
        active_ledger_id: 7,
        active_ledger_name: 'Gia đình',
      }],
    },
    transactions: {
      getMonthlySummary: async () => [],
      getDailySummary: async (params) => {
        dailyCalls.push(params);
        return [{ transaction_type: 'expense', category: 'Ăn uống', total: 50_000 }];
      },
    },
  });

  await scheduler.runDailyJobs({
    sendMessage: async (chatId, text) => messages.push({ chatId, text }),
  }, new Date('2026-10-16T13:00:00.000Z'));

  assert.deepEqual(dailyCalls, [{
    ledgerId: 7,
    date: '2026-10-16',
    timezone: 'Asia/Ho_Chi_Minh',
  }]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].chatId, 456);
  assert.match(messages[0].text, /Tổng chi hôm nay: 50\.000 VNĐ/);
});
