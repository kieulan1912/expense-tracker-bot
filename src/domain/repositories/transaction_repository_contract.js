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
  'findRecentDuplicates',
  'detectRecurringCandidate',
  'getWeeklyInsights',
  'getSpendingInsights',
  'adjustTransaction',
  'deleteTransaction',
  'getSpendingBetween',
  'deleteAllUserData',
]);

module.exports = { transactionRepositoryMethods };
