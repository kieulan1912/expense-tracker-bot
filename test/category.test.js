const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCategory } = require('../src/utils/category');

test('phân loại khoản chi theo từ khóa', () => {
  assert.equal(detectCategory('ăn phở bò', 'expense'), 'Ăn uống');
  assert.equal(detectCategory('ăn xôi sáng', 'expense'), 'Ăn uống');
  assert.equal(detectCategory('AN XOI SANG', 'expense'), 'Ăn uống');
  assert.equal(detectCategory('đổ xăng', 'expense'), 'Di chuyển');
  assert.equal(detectCategory('tiền điện tháng 10', 'expense'), 'Hóa đơn & sinh hoạt');
});

test('bảng local bao phủ các nhóm chi tiêu chính', () => {
  const cases = [
    ['mua trà sữa', 'Ăn uống'],
    ['bảo dưỡng xe máy', 'Di chuyển'],
    ['đóng phí chung cư', 'Hóa đơn & sinh hoạt'],
    ['mua điện thoại mới', 'Mua sắm & giải trí'],
    ['đi xét nghiệm máu', 'Sức khỏe'],
    ['đóng học phí', 'Giáo dục & phát triển'],
    ['biếu bố mẹ', 'Cho tặng & gia đình'],
  ];

  for (const [description, category] of cases) {
    assert.equal(detectCategory(description, 'expense'), category, description);
  }
});

test('ưu tiên cụm từ cụ thể nhất khi có nhiều từ khóa', () => {
  assert.equal(detectCategory('mua điện thoại mới', 'expense'), 'Mua sắm & giải trí');
  assert.equal(detectCategory('đóng tiền điện thoại', 'expense'), 'Hóa đơn & sinh hoạt');
});

test('phân loại khoản thu theo từ khóa', () => {
  assert.equal(detectCategory('lương tháng 10', 'income'), 'Lương');
  assert.equal(detectCategory('thưởng dự án', 'income'), 'Thưởng');
  assert.equal(detectCategory('TIEN LAI ngân hàng', 'income'), 'Đầu tư');
  assert.equal(detectCategory('doanh thu freelance', 'income'), 'Kinh doanh');
});

test('dùng danh mục Khác khi không khớp', () => {
  assert.equal(detectCategory('nội dung bất kỳ', 'expense'), 'Khác');
});
