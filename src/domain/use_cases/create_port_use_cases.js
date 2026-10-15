const { assertRepositoryContract } = require('../repositories/repository_contract');

function createPortUseCases(name, port, methods) {
  const checkedPort = assertRepositoryContract(name, port, methods);
  return Object.freeze(Object.fromEntries(
    methods.map((method) => [method, (...args) => checkedPort[method](...args)]),
  ));
}

module.exports = { createPortUseCases };
