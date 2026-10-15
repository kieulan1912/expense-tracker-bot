const { ledgerRepositoryMethods } = require('../repositories/ledger_repository_contract');
const { createPortUseCases } = require('./create_port_use_cases');

function createLedgerUseCases(repository) {
  return createPortUseCases('Ledger', repository, ledgerRepositoryMethods);
}

module.exports = { createLedgerUseCases };
