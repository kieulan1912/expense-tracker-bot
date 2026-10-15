const test = require('node:test');
const assert = require('node:assert/strict');

const { createBot } = require('../src/presentation/telegram/create_bot');
const {
  transactionRepositoryMethods,
} = require('../src/domain/repositories/transaction_repository_contract');
const {
  financeRepositoryMethods,
} = require('../src/domain/repositories/finance_repository_contract');
const {
  ledgerRepositoryMethods,
} = require('../src/domain/repositories/ledger_repository_contract');
const {
  userRepositoryMethods,
} = require('../src/domain/repositories/user_repository_contract');
const { aiGatewayMethods } = require('../src/domain/repositories/ai_gateway_contract');

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

  use() {}

  catch() {}
}

function stubPort(methods) {
  return Object.fromEntries(methods.map((method) => [method, async () => null]));
}

test('composition đăng ký đủ command và event sau refactor', () => {
  const bot = new FakeBot();
  createBot({
    config: {
      telegramBotToken: '000000000:test-token',
      allowedUserIds: new Set(),
      botRateLimitPerMinute: 30,
      timezone: 'Asia/Ho_Chi_Minh',
    },
    useCases: {
      transactions: stubPort(transactionRepositoryMethods),
      finance: stubPort(financeRepositoryMethods),
      ledgers: stubPort(ledgerRepositoryMethods),
      users: stubPort(userRepositoryMethods),
      ai: stubPort(aiGatewayMethods),
    },
    pendingStore: {
      createPending() {},
      consumePending() {},
      cancelPending() {},
    },
    bot,
  });

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
  assert.equal(bot.actions.length, 42);
  assert.equal(bot.actions.length, new Set(bot.actions).size);
});
