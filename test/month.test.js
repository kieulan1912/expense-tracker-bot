const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMonth } = require('../src/utils/month');

test('parseMonth đọc MM/YYYY', () => {
  assert.deepEqual(parseMonth('10/2026', 'Asia/Ho_Chi_Minh'), {
    month: 10,
    year: 2026,
  });
});

test('parseMonth từ chối tháng sai', () => {
  assert.throws(() => parseMonth('13/2026', 'Asia/Ho_Chi_Minh'));
  assert.throws(() => parseMonth('2026-10', 'Asia/Ho_Chi_Minh'));
});
