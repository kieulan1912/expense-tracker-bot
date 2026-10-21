const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSearchInput } = require('../src/utils/search');

test('parseSearchInput kết hợp từ khóa và nhiều bộ lọc theo AND', () => {
  assert.deepEqual(
    parseSearchInput('mua sữa cho con | chi | tháng 10/2026 | min 100k | max 500k | người Lân | giới hạn 15'),
    {
      keyword: 'mua sữa cho con',
      transactionType: 'expense',
      categoryId: null,
      amountMin: 100_000,
      amountMax: 500_000,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      createdBy: 'Lân',
      limit: 15,
    },
  );
});

test('parseSearchInput hỗ trợ ngày và danh mục không dấu', () => {
  const result = parseSearchInput('ngay 20/10/2026 | danh muc An uong | nguoi Lan');
  assert.equal(result.dateFrom, '2026-10-20');
  assert.equal(result.dateTo, '2026-10-20');
  assert.equal(result.categoryId, 1);
  assert.equal(result.createdBy, 'Lan');
});

test('parseSearchInput từ chối khoảng ngày và khoảng tiền đảo ngược', () => {
  assert.throws(() => parseSearchInput('sữa | từ 20/10/2026 | đến 01/10/2026'));
  assert.throws(() => parseSearchInput('sữa | min 500k | max 100k'));
});
