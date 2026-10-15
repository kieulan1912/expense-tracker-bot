const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TELEGRAM_BOT_TOKEN ||= '000000000:test-token';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.DB_SSL ||= 'disable';

const { registerLedgerHandlers } = require('../src/presentation/telegram/handlers/ledger_handlers');
const { registerFinanceHandlers } = require('../src/presentation/telegram/handlers/finance_handlers');
const { registerMenuHandlers } = require('../src/presentation/telegram/handlers/menu_handlers');
const { registerAiHandlers } = require('../src/presentation/telegram/handlers/ai_handlers');

class FakeBot {
  constructor() {
    this.commands = [];
    this.actions = [];
    this.events = [];
    this.lifecycle = [];
  }

  command(name) { this.commands.push(name); }

  action(trigger) { this.actions.push(String(trigger)); }

  on(event) { this.events.push(event); }

  start() { this.lifecycle.push('start'); }

  help() { this.lifecycle.push('help'); }
}

test('composition đăng ký đủ command và event sau refactor', () => {
  const bot = new FakeBot();
  const handleLedgerTextInput = registerLedgerHandlers(bot);
  registerFinanceHandlers(bot);
  registerMenuHandlers(bot, { forgetUser() {} });
  registerAiHandlers(bot, { handleLedgerTextInput });

  assert.deepEqual(new Set(bot.commands), new Set([
    'taoso', 'moi', 'thamgia', 'danhsachso', 'chonso', 'thanhvien',
    'phanquyen', 'xoathanhvien', 'roiso', 'xoaso', 'cancel',
    'id', 'chi', 'thu', 'baocao', 'bieudo', 'lichsu', 'xoa', 'export',
    'ngansach', 'no', 'dinhky',
    'menu', 'nhacnho', 'phongcach', 'ocr', 'aiquota', 'quyenriengtu',
    'deletedata',
  ]));
  assert.equal(bot.commands.length, new Set(bot.commands).size);
  assert.deepEqual(new Set(bot.events), new Set(['photo', 'document', 'text']));
  assert.deepEqual(new Set(bot.lifecycle), new Set(['start', 'help']));
  assert.equal(bot.actions.length, 40);
  assert.equal(bot.actions.length, new Set(bot.actions).size);
});
