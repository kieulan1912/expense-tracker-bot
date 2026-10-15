const { createTransactionUseCases } = require('./transaction_use_cases');
const { createFinanceUseCases } = require('./finance_use_cases');
const { createLedgerUseCases } = require('./ledger_use_cases');
const { createUserUseCases } = require('./user_use_cases');
const { createAiUseCases } = require('./ai_use_cases');

function createUseCases({
  transactionRepository,
  financeRepository,
  ledgerRepository,
  userRepository,
  aiGateway,
}) {
  return Object.freeze({
    transactions: createTransactionUseCases(transactionRepository),
    finance: createFinanceUseCases(financeRepository),
    ledgers: createLedgerUseCases(ledgerRepository),
    users: createUserUseCases(userRepository),
    ai: createAiUseCases(aiGateway),
  });
}

module.exports = { createUseCases };
