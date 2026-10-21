const test = require('node:test');
const assert = require('node:assert/strict');
const { InputError } = require('../src/domain/errors');
const {
  parseTransactionInput,
  parseMultipleExpenseInput,
} = require('../src/utils/command');

test('giao dịch nhận số tiền ở đầu, cuối hoặc giữa nội dung', () => {
  assert.deepEqual(parseTransactionInput('/chi 15k ăn xôi sáng', 'chi'), {
    amountText: '15k',
    description: 'ăn xôi sáng',
  });
  assert.deepEqual(parseTransactionInput('/chi ăn xôi sáng 15k', 'chi'), {
    amountText: '15k',
    description: 'ăn xôi sáng',
  });
  assert.deepEqual(parseTransactionInput('/chi ăn xôi 15k buổi sáng', 'chi'), {
    amountText: '15k',
    description: 'ăn xôi buổi sáng',
  });
});

test('giao dịch nhận số tiền có hậu tố tách bằng khoảng trắng', () => {
  assert.deepEqual(parseTransactionInput('/thu tiền thưởng 2 triệu', 'thu'), {
    amountText: '2 triệu',
    description: 'tiền thưởng',
  });
  assert.deepEqual(parseTransactionInput('/chi 50.000 VNĐ ăn trưa', 'chi'), {
    amountText: '50.000 VND',
    description: 'ăn trưa',
  });
});

test('số đếm trong ghi chú không bị hiểu nhầm khi đã có số tiền rõ ràng', () => {
  assert.deepEqual(parseTransactionInput('/chi 50k tiền điện tháng 10', 'chi'), {
    amountText: '50k',
    description: 'tiền điện tháng 10',
  });
  assert.deepEqual(parseTransactionInput('/chi mua 2 vé xem phim 150000', 'chi'), {
    amountText: '150000',
    description: 'mua 2 vé xem phim',
  });
  assert.deepEqual(parseTransactionInput('/thu lương tháng 10 20tr', 'thu'), {
    amountText: '20tr',
    description: 'lương tháng 10',
  });
});

test('giao dịch từ chối nhiều số tiền rõ ràng hoặc thiếu ghi chú', () => {
  assert.throws(
    () => parseTransactionInput('/chi trả 50k cho hóa đơn 100k', 'chi'),
    InputError,
  );
  assert.throws(() => parseTransactionInput('/chi 50k', 'chi'), InputError);
});

test('lỗi cú pháp dùng ví dụ phù hợp với lệnh thu và chi', () => {
  assert.throws(
    () => parseTransactionInput('/thu 15tr', 'thu'),
    (error) =>
      error instanceof InputError
      && error.message.includes('/thu 15tr lương tháng 10')
      && error.message.includes('/thu lương tháng 10 15tr')
      && !error.message.includes('phở'),
  );
  assert.throws(
    () => parseTransactionInput('/chi 50k', 'chi'),
    (error) =>
      error instanceof InputError
      && error.message.includes('/chi 50k phở bò')
      && error.message.includes('/chi phở bò 50k'),
  );
});

test('lỗi nhiều số tiền của lệnh thu không dùng ví dụ khoản chi', () => {
  assert.throws(
    () => parseTransactionInput('/thu lương 10tr thưởng 2tr', 'thu'),
    (error) =>
      error instanceof InputError
      && error.message.includes('/thu lương tháng 10 15tr')
      && !error.message.includes('xôi'),
  );
});

test('tách khoản biếu nhiều người thành giao dịch độc lập', () => {
  assert.deepEqual(
    parseMultipleExpenseInput('/chi biếu bà + mẹ mỗi người 500k'),
    [
      { amount: 500_000, description: 'biếu bà', personName: 'bà' },
      { amount: 500_000, description: 'biếu mẹ', personName: 'mẹ' },
    ],
  );
  assert.deepEqual(
    parseMultipleExpenseInput('/chi biếu bà 500k; biếu mẹ 500k'),
    [
      { amount: 500_000, description: 'biếu bà', personName: 'bà' },
      { amount: 500_000, description: 'biếu mẹ', personName: 'mẹ' },
    ],
  );
});
