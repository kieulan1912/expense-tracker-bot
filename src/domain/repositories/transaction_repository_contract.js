const transactionRepositoryMethods = Object.freeze([
  'createTransaction',
  'createTransactions',
  'getMonthlySummary',
  'getMonthlyTransactions',
  'getDailySummary',
  'getRecentTransactions',
  'searchTransactions',
  'getTransactionById',
  'findRecentExpenseCandidates',
  'adjustTransaction',
  'deleteTransaction',
  'getSpendingBetween',
  'deleteAllUserData',
]);

module.exports = { transactionRepositoryMethods };
