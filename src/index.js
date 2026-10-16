const { createApplication } = require('./infrastructure/composition_root');
const { botCommands } = require('./presentation/telegram/bot_commands');

const {
  config,
  pool,
  initializeDatabase,
  bot,
  server,
  startScheduler,
} = createApplication();
let isShuttingDown = false;
let stopScheduler = () => {};

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Nhận ${signal}, đang dừng ứng dụng...`);

  stopScheduler();
  bot.stop(signal);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}

async function main() {
  await initializeDatabase();
  console.log('Kết nối PostgreSQL thành công');

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Health server đang chạy tại port ${config.port}`);
  });

  await bot.telegram.setMyCommands(botCommands);

  await bot.launch({ dropPendingUpdates: true });
  stopScheduler = startScheduler(bot.telegram);
  console.log('Telegram bot đã khởi động');
}

process.once('SIGINT', async () => {
  await shutdown('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await shutdown('SIGTERM');
  process.exit(0);
});

main().catch(async (error) => {
  console.error('Không thể khởi động ứng dụng:', error);
  server.close();
  await pool.end();
  process.exit(1);
});
