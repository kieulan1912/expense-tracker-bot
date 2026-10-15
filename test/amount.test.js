const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, formatMoney } = require('../src/utils/amount');

test('parseAmount hỗ trợ các định dạng tiền Việt phổ biến', () => {
  assert.equal(parseAmount('50k'), 50_000);
  assert.equal(parseAmount('1.5tr'), 1_500_000);
  assert.equal(parseAmount('1,5tr'), 1_500_000);
  assert.equal(parseAmount('50.000'), 50_000);
  assert.equal(parseAmount('1,500,000'), 1_500_000);
  assert.equal(parseAmount('50000đ'), 50_000);
  assert.equal(parseAmount('2 củ'), 2_000_000);
  assert.equal(parseAmount('3 ngàn'), 3_000);
  assert.equal(parseAmount('2 tờ'), 200_000);
});

test('parseAmount từ chối giá trị sai', () => {
  assert.throws(() => parseAmount('abc'));
  assert.throws(() => parseAmount('0'));
  assert.throws(() => parseAmount('-50k'));
});

test('formatMoney định dạng tiền Việt', () => {
  assert.equal(formatMoney(50_000), '50.000 VNĐ');
});
