const botCommands = Object.freeze([
  { command: 'start', description: 'Bắt đầu sử dụng' },
  { command: 'chi', description: 'Ghi một khoản chi' },
  { command: 'thu', description: 'Ghi một khoản thu' },
  { command: 'baocao', description: 'Xem báo cáo tháng' },
  { command: 'lichsu', description: 'Xem N giao dịch gần nhất' },
  { command: 'export', description: 'Xuất CSV theo tháng' },
  { command: 'menu', description: 'Mở tất cả chức năng' },
]);

module.exports = { botCommands };
