const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createTransactionRepository,
} = require('../src/data/postgres/repositories/transaction_repository');

test('searchTransactions lọc từ khóa và người ghi không phân biệt dấu', async () => {
  let query;
  const pool = {
    async query(sql, params) {
      query = { sql, params };
      return {
        rows: [
          {
            id: 1, transaction_type: 'expense', amount: '120000', category_id: 1,
            category: 'Ăn uống', description: 'Mua sữa cho con', counterparty_name: null,
            created_by_name: 'Lân', local_created_at: '20/10/2026 08:00',
          },
          {
            id: 2, transaction_type: 'expense', amount: '90000', category_id: 1,
            category: 'Ăn uống', description: 'Mua bánh', counterparty_name: null,
            created_by_name: 'Thu', local_created_at: '20/10/2026 07:00',
          },
        ],
      };
    },
  };
  const repository = createTransactionRepository(pool);
  const rows = await repository.searchTransactions({
    ledgerId: 8,
    keyword: 'mua sua con',
    transactionType: 'expense',
    amountMin: 100000,
    createdBy: 'Lan',
    limit: 10,
    timezone: 'Asia/Ho_Chi_Minh',
  });
  assert.deepEqual(rows.map((row) => row.id), [1]);
  assert.match(query.sql, /t\.ledger_id = \$1/);
  assert.deepEqual(query.params.slice(0, 5), [8, 'expense', null, 100000, null]);
});
