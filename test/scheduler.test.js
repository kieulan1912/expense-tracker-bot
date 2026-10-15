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
    },
    users: { getReminderUsers: async () => [] },
    transactions: { getMonthlySummary: async () => [] },
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
