const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCategory } = require('../src/utils/category');

test('phân loại khoản chi theo từ khóa', () => {
  assert.equal(detectCategory('ăn phở bò', 'expense'), 'Ăn uống');
  assert.equal(detectCategory('đổ xăng', 'expense'), 'Di chuyển');
  assert.equal(detectCategory('tiền điện tháng 10', 'expense'), 'Hóa đơn & sinh hoạt');
});

test('phân loại khoản thu theo từ khóa', () => {
  assert.equal(detectCategory('lương tháng 10', 'income'), 'Lương');
  assert.equal(detectCategory('thưởng dự án', 'income'), 'Thưởng');
});

test('dùng danh mục Khác khi không khớp', () => {
  assert.equal(detectCategory('nội dung bất kỳ', 'expense'), 'Khác');
});
