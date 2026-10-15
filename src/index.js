const { config } = require('./config');
const { pool, initializeDatabase } = require('./database');
const { bot } = require('./bot');
const { createHealthServer } = require('./server');
const { startScheduler } = require('./scheduler');

const server = createHealthServer();
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

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Bắt đầu sử dụng' },
    { command: 'chi', description: 'Ghi một khoản chi' },
    { command: 'thu', description: 'Ghi một khoản thu' },
    { command: 'baocao', description: 'Xem báo cáo tháng' },
    { command: 'bieudo', description: 'Xem biểu đồ chi tiêu' },
    { command: 'lichsu', description: 'Xem N giao dịch gần nhất' },
    { command: 'xoa', description: 'Xóa một giao dịch' },
    { command: 'export', description: 'Xuất báo cáo CSV' },
    { command: 'ngansach', description: 'Quản lý ngân sách' },
    { command: 'no', description: 'Quản lý công nợ' },
    { command: 'dinhky', description: 'Giao dịch định kỳ' },
    { command: 'nhacnho', description: 'Bật/tắt báo cáo tự động' },
    { command: 'phongcach', description: 'Đổi tính cách bot' },
    { command: 'ocr', description: 'Bật/tắt đọc ảnh hóa đơn' },
    { command: 'aiquota', description: 'Xem quota AI hôm nay' },
    { command: 'quyenriengtu', description: 'Xem chính sách dữ liệu' },
    { command: 'deletedata', description: 'Xóa toàn bộ dữ liệu của bạn' },
    { command: 'id', description: 'Xem Telegram User ID' },
    { command: 'help', description: 'Xem hướng dẫn' },
  ]);

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
