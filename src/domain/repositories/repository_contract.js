function assertRepositoryContract(name, repository, methods) {
  if (!repository || typeof repository !== 'object') {
    throw new TypeError(`${name} repository is required`);
  }
  const missing = methods.filter((method) => typeof repository[method] !== 'function');
  if (missing.length) {
    throw new TypeError(`${name} repository is missing: ${missing.join(', ')}`);
  }
  return repository;
}

module.exports = { assertRepositoryContract };
