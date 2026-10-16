const test = require('node:test');
const assert = require('node:assert/strict');
const { transactionsToCsv } = require('../src/utils/csv');

test('CSV có tổng thu, tổng chi và chênh lệch ở cuối file', () => {
  const csv = transactionsToCsv([
    {
      id: 1,
      transaction_type: 'income',
      amount: '5000000',
      category: 'Lương',
      description: 'Lương tháng 10',
      created_by_name: 'Lân',
      local_created_at: '2026-10-01 08:00:00',
    },
    {
      id: 2,
      transaction_type: 'expense',
      amount: '1250000',
      category: 'Khác',
      description: 'Chi phí gia đình',
      created_by_name: 'Thu',
      local_created_at: '2026-10-02 09:30:00',
    },
  ]);

  assert.match(csv, /,Thu,5\.000\.000,/);
  assert.match(csv, /,Chi,1\.250\.000,/);
  assert.match(csv, /,Tổng thu,5\.000\.000,/);
  assert.match(csv, /,Tổng chi,1\.250\.000,/);
  assert.match(csv, /,Chênh lệch thu-chi,3\.750\.000,/);
});
