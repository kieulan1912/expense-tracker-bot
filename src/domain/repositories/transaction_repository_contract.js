const transactionRepositoryMethods = Object.freeze([
  'createTransaction',
  'createTransactions',
  'getMonthlySummary',
  'getMonthlyTransactions',
  'getDailySummary',
  'getRecentTransactions',
  'deleteTransaction',
  'getSpendingBetween',
  'deleteAllUserData',
]);

module.exports = { transactionRepositoryMethods };
