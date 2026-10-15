const transactionRepositoryMethods = Object.freeze([
  'createTransaction',
  'createTransactions',
  'getMonthlySummary',
  'getMonthlyTransactions',
  'getRecentTransactions',
  'deleteTransaction',
  'getSpendingBetween',
  'deleteAllUserData',
]);

module.exports = { transactionRepositoryMethods };
