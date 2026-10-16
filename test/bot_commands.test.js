const test = require('node:test');
const assert = require('node:assert/strict');
const { botCommands } = require('../src/presentation/telegram/bot_commands');

test('Telegram hiển thị export trong danh sách command chính', () => {
  const names = botCommands.map((item) => item.command);
  assert.deepEqual(names, [
    'start', 'chi', 'thu', 'baocao', 'lichsu', 'export', 'menu',
  ]);
  assert.equal(new Set(names).size, names.length);
});
