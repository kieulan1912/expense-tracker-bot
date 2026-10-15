const { userRepositoryMethods } = require('../repositories/user_repository_contract');
const { createPortUseCases } = require('./create_port_use_cases');

function createUserUseCases(repository) {
  return createPortUseCases('User', repository, userRepositoryMethods);
}

module.exports = { createUserUseCases };
