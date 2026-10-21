const { Markup } = require('telegraf');
const { formatMoney } = require('../../utils/amount');
const { getCategoryName, isSensitiveCategory } = require('../../utils/category');
const { roleLabel } = require('../../domain/ledger_policy');
const { telegramDisplayName } = require('./context');

const helpMessage = [
  '📖 QUẢN GIA TÀI CHÍNH AI', '',
  'Dùng /menu để mở toàn bộ chức năng bằng nút.', '',
  'Ghi nhanh:', '/chi 50k phở bò', '/chi phở bò 50k', '/thu lương tháng 10 15tr',
  'Hoặc nhắn tự nhiên: “sáng nay phở 50k, cafe 35k”', '',
  'Báo cáo:',
  '/baocao [MM/YYYY] · /bieudo [MM/YYYY]',
  '/lichsu [số lượng] · /tim [từ khóa | bộ lọc]',
  '/export [MM/YYYY] · /xoa ID', '',
  'Kế hoạch:',
  '/ngansach — xem ngân sách',
  '/ngansach 10tr — đặt tổng ngân sách',
  '/ngansach 1 3tr — đặt 3tr cho Ăn uống', '',
  'Công nợ:',
  '/no — danh sách',
  '/no phai-thu Nam 200k | tiền Grab | 30/10/2026',
  '/no phai-tra Lan 1tr | tiền nhà',
  '/no tra Nam 100k · /no tattoan Nam', '',
  'Tự động:',
  '/dinhky — danh sách', '/dinhky them chi 200k Internet | 5',
  '/dinhky xoa ID · /nhacnho on|off (mặc định bật)', '',
  'Cài đặt:',
  '/phongcach nhe|haihuoc|thang',
  '/ocr on|off — bật/tắt đọc ảnh hóa đơn',
  '/aiquota — xem lượt AI hôm nay',
  '/quyenriengtu · /deletedata · /id', '',
  'Sổ dùng chung:',
  '/taoso [tên] · /moi · /thamgia [mã]',
  '/danhsachso · /chonso ID · /thanhvien',
].join('\n');

function funnyComment(type, categoryId, personality = 'funny') {
  if (type !== 'expense' || isSensitiveCategory(categoryId)) return '';
  if (personality === 'gentle') return 'Đã ghi lại để bạn dễ theo dõi kế hoạch nhé.';
  if (personality === 'direct') return 'Đã ghi. Hãy kiểm tra ngân sách còn lại trước khoản chi tiếp theo.';
  const comments = {
    1: 'Ví vừa nhẹ đi một chút, bụng chắc vui hơn rồi 😄',
    2: 'Bánh xe lăn, tiền cũng lăn theo 🛵',
    3: 'Hóa đơn đã được thuần hóa. Tạm thời thôi nhé ⚡',
    4: 'Món này là “cần” hay “rất muốn cần” đây? 😏',
  };
  return comments[categoryId] || '';
}

function transactionLines(item) {
  return [
    `${item.type === 'expense' ? '📤' : '📥'} ${formatMoney(item.amount)}`,
    `🏷 ${getCategoryName(item.categoryId, item.type)}`,
    `📝 ${item.description}`,
  ];
}

async function sendSaved(ctx, saved, comment = '', ledger = ctx.state.ledger) {
  const list = Array.isArray(saved) ? saved : [saved];
  const lines = [`✅ Đã ghi vào “${ledger.name}”`, ''];
  for (const item of list) {
    lines.push(...transactionLines({
      type: item.transaction_type,
      amount: item.amount,
      categoryId: item.category_id,
      description: item.description,
    }), `🔖 #${item.id}`, '');
  }
  lines.push(`👤 Người ghi: ${telegramDisplayName(ctx.from)}`, '');
  if (comment) lines.push(comment, '');
  const buttons = list.length === 1
    ? Markup.inlineKeyboard([Markup.button.callback('↩️ Hoàn tác', `undo:${list[0].id}`)])
    : undefined;
  await ctx.reply(lines.join('\n').trim(), buttons);
}

function formatRecentTransactions(rows, title) {
  const lines = rows.map((row) => {
    const icon = row.transaction_type === 'expense' ? '📤' : '📥';
    const description = row.description.length > 100
      ? `${row.description.slice(0, 97)}...`
      : row.description;
    return `${icon} #${row.id} · ${formatMoney(row.amount)}\n${row.category} · ${description}\n👤 ${row.created_by_name}\n${row.local_created_at}`;
  });
  return [title, '', ...lines].join('\n\n');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatTransactionDateTime(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return '--/--/---- · --:--';
  return `${match[3]}/${match[2]}/${match[1]} · ${match[4] || '--'}:${match[5] || '--'}`;
}

function truncate(value, length) {
  const text = String(value || '').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function formatMonthlyTransactionDetails(
  rows,
  { month, year, ledgerName = '', page = 1, pageSize = 8 },
) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);
  const details = items.flatMap((row) => [
    `${row.transaction_type === 'income' ? '📥' : '📤'} <b>#${escapeHtml(row.id)} · ${row.transaction_type === 'income' ? 'Thu' : 'Chi'} ${escapeHtml(formatMoney(row.amount))}</b> · ${escapeHtml(truncate(row.category, 40))}`,
    `🗓 ${escapeHtml(formatTransactionDateTime(row.local_created_at))} · 👤 ${escapeHtml(truncate(row.created_by_name, 40) || 'Không xác định')}`,
    `📝 ${escapeHtml(truncate(row.description, 80) || 'Không có ghi chú')}`,
    '',
  ]);

  return {
    text: [
      `📋 <b>CHI TIẾT THÁNG ${month}/${year}</b>`,
      ...(ledgerName ? [`📒 ${escapeHtml(ledgerName)}`] : []),
      `Trang ${currentPage}/${totalPages} · ${rows.length} giao dịch`,
      '',
      ...details,
    ].join('\n').trim(),
    page: currentPage,
    totalPages,
  };
}

function monthlyReportKeyboard(ledgerId, month, year) {
  return Markup.inlineKeyboard([[
    Markup.button.callback(
      '📋 Xem chi tiết',
      `report:details:${ledgerId}:${year}:${month}:1`,
    ),
  ]]);
}

function monthlyReportDetailsKeyboard(ledgerId, month, year, page, totalPages) {
  const pagination = [];
  if (page > 1) {
    pagination.push(Markup.button.callback(
      '⬅️ Trang trước',
      `report:details:${ledgerId}:${year}:${month}:${page - 1}`,
    ));
  }
  if (page < totalPages) {
    pagination.push(Markup.button.callback(
      'Trang sau ➡️',
      `report:details:${ledgerId}:${year}:${month}:${page + 1}`,
    ));
  }
  const rows = pagination.length ? [pagination] : [];
  rows.push([Markup.button.callback(
    '📊 Xem tổng quan',
    `report:summary:${ledgerId}:${year}:${month}`,
  )]);
  return Markup.inlineKeyboard(rows);
}

async function showMainMenu(ctx) {
  const ledger = ctx.state.ledger;
  return ctx.reply([
    '📒 SỔ HIỆN TẠI', `${ledger.name} · ${roleLabel(ledger.role)}`, '',
    'Chọn chức năng bên dưới:',
  ].join('\n'), Markup.inlineKeyboard([
    [Markup.button.callback('➕ Ghi khoản chi', 'menu:expense'), Markup.button.callback('💰 Ghi khoản thu', 'menu:income')],
    [Markup.button.callback('📊 Báo cáo', 'menu:reports'), Markup.button.callback('🕘 Lịch sử', 'menu:history')],
    [Markup.button.callback('🎯 Kế hoạch', 'menu:plans'), Markup.button.callback('👨‍👩‍👧 Sổ chung', 'menu:ledgers')],
    [Markup.button.callback('⚙️ Cài đặt', 'menu:settings'), Markup.button.callback('❓ Trợ giúp', 'menu:help')],
  ]));
}

async function showLedgerMenu(ctx) {
  const ledger = ctx.state.ledger;
  const rows = [
    [Markup.button.callback('🔄 Đổi sổ', 'ledger:list'), Markup.button.callback('➕ Tạo sổ', 'ledger:create')],
    [Markup.button.callback('🔑 Tham gia sổ', 'ledger:join'), Markup.button.callback('👥 Thành viên', 'ledger:members')],
  ];
  if (ledger.role === 'owner' && ledger.kind === 'shared') {
    rows.push([Markup.button.callback('✉️ Mời người', 'ledger:invite'), Markup.button.callback('🗑 Xóa sổ', 'ledger:delete')]);
  } else if (ledger.kind === 'shared') {
    rows.push([Markup.button.callback('🚪 Rời sổ', 'ledger:leave')]);
  }
  rows.push([Markup.button.callback('⬅️ Menu chính', 'menu:main')]);
  return ctx.reply([
    '👨‍👩‍👧 QUẢN LÝ SỔ', '', `📒 ${ledger.name}`, `🔐 ${roleLabel(ledger.role)}`,
  ].join('\n'), Markup.inlineKeyboard(rows));
}

module.exports = {
  helpMessage,
  funnyComment,
  transactionLines,
  sendSaved,
  formatRecentTransactions,
  formatMonthlyTransactionDetails,
  monthlyReportKeyboard,
  monthlyReportDetailsKeyboard,
  showMainMenu,
  showLedgerMenu,
};
