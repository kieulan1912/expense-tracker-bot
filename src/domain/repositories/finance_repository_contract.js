const financeRepositoryMethods = Object.freeze([
  'upsertBudget',
  'getBudgets',
  'getBudgetStatus',
  'createDebt',
  'payDebt',
  'getOpenDebts',
  'createRecurring',
  'getRecurring',
  'deleteRecurring',
  'getDueRecurring',
  'markRecurringPrompted',
  'getRecurringById',
  'getExpenseStats',
  'getDueDebts',
  'markDebtReminded',
]);

module.exports = { financeRepositoryMethods };
