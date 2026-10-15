const { Telegraf } = require('telegraf');
const { InputError } = require('../../domain/errors');
const { createContextMiddleware, createNotifyUser } = require('./context');
const { helpMessage } = require('./views');
const { registerLedgerHandlers } = require('./handlers/ledger_handlers');
const {
  registerFinanceHandlers,
  createBudgetWarning,
} = require('./handlers/finance_handlers');
const { registerMenuHandlers } = require('./handlers/menu_handlers');
const { registerAiHandlers } = require('./handlers/ai_handlers');

function createBot({ config, useCases, pendingStore, bot: providedBot = null }) {
  const bot = providedBot || new Telegraf(config.telegramBotToken);
  const context = createContextMiddleware({
    config,
    users: useCases.users,
    ledgers: useCases.ledgers,
  });
  const notifyUser = createNotifyUser(useCases.users);
  const getBudgetWarning = createBudgetWarning({ config, finance: useCases.finance });

  bot.use(context.middleware);

  const handleLedgerTextInput = registerLedgerHandlers(bot, {
    ledgers: useCases.ledgers,
    notifyUser,
  });
  registerFinanceHandlers(bot, {
    config,
    transactions: useCases.transactions,
    finance: useCases.finance,
    ledgers: useCases.ledgers,
    users: useCases.users,
    getBudgetWarning,
  });
  registerMenuHandlers(bot, {
    config,
    transactions: useCases.transactions,
    finance: useCases.finance,
    users: useCases.users,
    ai: useCases.ai,
    forgetUser: context.forgetUser,
  });
  registerAiHandlers(bot, {
    config,
    transactions: useCases.transactions,
    finance: useCases.finance,
    ledgers: useCases.ledgers,
    users: useCases.users,
    ai: useCases.ai,
    pendingStore,
    getBudgetWarning,
    handleLedgerTextInput,
  });

  bot.catch(async (error, ctx) => {
    if (error instanceof InputError) return ctx.reply(`❌ ${error.message}`);
    console.error('Telegram handler error:', error);
    try {
      await ctx.reply('❌ Đã có lỗi xảy ra. Vui lòng thử lại sau.');
    } catch (replyError) {
      console.error('Không thể gửi thông báo lỗi:', replyError);
    }
  });

  return bot;
}

module.exports = { createBot, helpMessage };
