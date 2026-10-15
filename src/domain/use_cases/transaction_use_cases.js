const {
  transactionRepositoryMethods,
} = require('../repositories/transaction_repository_contract');
const { createPortUseCases } = require('./create_port_use_cases');

function createTransactionUseCases(repository) {
  return createPortUseCases('Transaction', repository, transactionRepositoryMethods);
}

module.exports = { createTransactionUseCases };
