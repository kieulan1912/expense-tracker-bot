const { Telegraf } = require('telegraf');
const { config } = require('../../config');
const { InputError } = require('../../errors');
const { createContextMiddleware } = require('./context');
const { helpMessage } = require('./views');
const { registerLedgerHandlers } = require('./handlers/ledger_handlers');
const { registerFinanceHandlers } = require('./handlers/finance_handlers');
const { registerMenuHandlers } = require('./handlers/menu_handlers');
const { registerAiHandlers, saveAiResult } = require('./handlers/ai_handlers');

function createBot() {
  const bot = new Telegraf(config.telegramBotToken);
  const context = createContextMiddleware();

  bot.use(context.middleware);

  const handleLedgerTextInput = registerLedgerHandlers(bot);
  registerFinanceHandlers(bot);
  registerMenuHandlers(bot, { forgetUser: context.forgetUser });
  registerAiHandlers(bot, { handleLedgerTextInput });

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

module.exports = { createBot, helpMessage, saveAiResult };
