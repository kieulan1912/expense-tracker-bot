const test = require('node:test');
const assert = require('node:assert/strict');
const { createTransactionUseCases } = require('../src/domain/use_cases/transaction_use_cases');
const {
  transactionRepositoryMethods,
} = require('../src/domain/repositories/transaction_repository_contract');

function transactionRepository(overrides = {}) {
  return {
    ...Object.fromEntries(transactionRepositoryMethods.map((method) => [method, async () => null])),
    ...overrides,
  };
}

test('transaction use cases chuyển input tới repository contract', async () => {
  const calls = [];
  const useCases = createTransactionUseCases(transactionRepository({
    async createTransaction(input) {
      calls.push(input);
      return { id: 42, ...input };
    },
  }));

  const input = { ledgerId: 7, amount: 50_000 };
  const result = await useCases.createTransaction(input);

  assert.deepEqual(calls, [input]);
  assert.equal(result.id, 42);
});

test('composition dừng sớm khi data adapter thiếu method bắt buộc', () => {
  assert.throws(
    () => createTransactionUseCases({ createTransaction() {} }),
    /Transaction repository is missing/,
  );
});
