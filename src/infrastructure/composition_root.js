const { config } = require('./config');
const { createDatabase } = require('../data/postgres/database');
const {
  createTransactionRepository,
} = require('../data/postgres/repositories/transaction_repository');
const {
  createFinanceRepository,
} = require('../data/postgres/repositories/finance_repository');
const { createLedgerRepository } = require('../data/postgres/repositories/ledger_repository');
const { createUserRepository } = require('../data/postgres/repositories/user_repository');
const { createGeminiAiGateway } = require('../data/gateways/gemini_ai_gateway');
const { createUseCases } = require('../domain/use_cases/create_use_cases');
const { createPendingStore } = require('./stores/pending_store');
const { createHealthServer } = require('./http/health_server');
const { createScheduler } = require('./scheduler/scheduler');
const { createBot } = require('../presentation/telegram/create_bot');

function createApplication({ telegramBot = null } = {}) {
  const database = createDatabase(config);
  const transactionRepository = createTransactionRepository(database.pool);
  const financeRepository = createFinanceRepository(database.pool);
  const ledgerRepository = createLedgerRepository(database.pool);
  const userRepository = createUserRepository(database.pool, config);
  const aiGateway = createGeminiAiGateway({ config, pool: database.pool });
  const useCases = createUseCases({
    transactionRepository,
    financeRepository,
    ledgerRepository,
    userRepository,
    aiGateway,
  });
  const pendingStore = createPendingStore();
  const bot = createBot({ config, useCases, pendingStore, bot: telegramBot });
  const server = createHealthServer({
    checkReadiness: () => database.pool.query('SELECT 1'),
  });
  const scheduler = createScheduler({
    config,
    finance: useCases.finance,
    users: useCases.users,
    transactions: useCases.transactions,
  });

  return Object.freeze({
    config,
    pool: database.pool,
    initializeDatabase: database.initializeDatabase,
    bot,
    server,
    startScheduler: scheduler.startScheduler,
  });
}

module.exports = { createApplication };
