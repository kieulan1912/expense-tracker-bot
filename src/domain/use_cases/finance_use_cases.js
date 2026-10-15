const { financeRepositoryMethods } = require('../repositories/finance_repository_contract');
const { createPortUseCases } = require('./create_port_use_cases');

function createFinanceUseCases(repository) {
  return createPortUseCases('Finance', repository, financeRepositoryMethods);
}

module.exports = { createFinanceUseCases };
