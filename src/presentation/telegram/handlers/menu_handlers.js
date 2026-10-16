const { Markup } = require('telegraf');
const { InputError } = require('../../../domain/errors');
const { getCommandArguments } = require('../../../utils/command');
const { getCurrentMonth, getCurrentDateParts } = require('../../../utils/month');
const { transactionsToCsv } = require('../../../utils/csv');
const {
  formatMonthlyReport,
  createChartUrl,
  formatBudgetStatus,
} = require('../../../domain/services/report_service');
const {
  helpMessage,
  formatRecentTransactions,
  monthlyReportKeyboard,
  showMainMenu,
} = require('../views');

function registerMenuHandlers(bot, {
  config,
  transactions,
  finance,
  users,
  ai,
  forgetUser,
}) {
  const {
    getMonthlySummary,
    getMonthlyTransactions,
    getRecentTransactions,
    deleteAllUserData,
  } = transactions;
  const { getBudgetStatus } = finance;
  const { getUser, updatePreference } = users;
  const { getUsageStatus } = ai;
  bot.command('menu', showMainMenu);
  bot.command('nhacnho', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'nhacnho').toLowerCase();
    if (!['on', 'off'].includes(input)) throw new InputError('Dùng /nhacnho on hoặc /nhacnho off.');
    await updatePreference(ctx.from.id, 'reminders_enabled', input === 'on');
    return ctx.reply(input === 'on' ? '🔔 Đã bật báo cáo tự động lúc 20:00.' : '🔕 Đã tắt báo cáo tự động.');
  });
  bot.command('phongcach', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'phongcach').toLowerCase();
    const values = { nhe: 'gentle', haihuoc: 'funny', thang: 'direct' };
    if (!values[input]) {
      throw new InputError('Dùng /phongcach nhe, /phongcach haihuoc hoặc /phongcach thang.');
    }
    await updatePreference(ctx.from.id, 'personality', values[input]);
    return ctx.reply('🎭 Đã đổi phong cách. Riêng sức khỏe, giáo dục và gia đình, tôi vẫn luôn tử tế.');
  });
  bot.command('ocr', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'ocr').toLowerCase();
    if (!['on', 'off'].includes(input)) throw new InputError('Dùng /ocr on hoặc /ocr off.');
    await updatePreference(ctx.from.id, 'ocr_consent', input === 'on');
    return ctx.reply(input === 'on'
      ? '✅ Đã bật OCR. Ảnh gửi tới Gemini chỉ được xử lý trong RAM.'
      : '🔒 Đã tắt OCR. Bot sẽ không gửi ảnh tới Gemini.');
  });
  bot.command('aiquota', async (ctx) => {
    const usage = await getUsageStatus(ctx.from.id);
    return ctx.reply(`🤖 LƯỢT AI HÔM NAY\n\nText: ${usage.text}/${usage.textLimit}\nẢnh: ${usage.image}/${usage.imageLimit}\nCác lệnh /chi, /thu và báo cáo không dùng quota AI.`);
  });
  bot.command('quyenriengtu', (ctx) => ctx.reply([
    '🔐 QUYỀN RIÊNG TƯ', '',
    '• Sổ cá nhân được tách riêng; sổ chung chỉ thành viên có quyền mới truy cập.',
    '• Mọi thao tác đọc/ghi đều kiểm tra membership và role trên server.',
    '• Câu tự nhiên và ảnh được gửi đến Gemini khi dùng AI.',
    '• Ảnh chỉ xử lý trong RAM, không lưu vào database.',
    '• Biểu đồ chỉ gửi số liệu tổng hợp đến QuickChart khi bạn gọi /bieudo.',
    '• Dùng /deletedata để xóa tài khoản cá nhân; owner dùng /xoaso cho sổ chung.',
  ].join('\n')));
  bot.command('deletedata', (ctx) => ctx.reply(
    '⚠️ Xóa tài khoản, sổ cá nhân và rời các sổ đang tham gia? Dữ liệu trong sổ chung vẫn được giữ lại. Nếu bạn đang sở hữu sổ chung, hãy xử lý sổ đó trước.',
    Markup.inlineKeyboard([
      Markup.button.callback('🗑 Xác nhận xóa', 'deleteall:confirm'),
      Markup.button.callback('Hủy', 'deleteall:cancel'),
    ]),
  ));

  bot.action('menu:main', async (ctx) => {
    await ctx.answerCbQuery();
    return showMainMenu(ctx);
  });
  bot.action('menu:expense', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.state.ledger.role === 'viewer') {
      return ctx.reply('⛔ Bạn đang có quyền Người xem nên không thể ghi khoản chi.');
    }
    return ctx.reply('Gửi theo mẫu: /chi 50k ăn phở\nHoặc nhắn tự nhiên: sáng nay ăn phở 50 nghìn.');
  });
  bot.action('menu:income', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.state.ledger.role === 'viewer') {
      return ctx.reply('⛔ Bạn đang có quyền Người xem nên không thể ghi khoản thu.');
    }
    return ctx.reply('Gửi theo mẫu: /thu 20tr lương tháng 10.');
  });
  bot.action('menu:reports', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('📊 BÁO CÁO', Markup.inlineKeyboard([
      [Markup.button.callback('Tháng này', 'report:current'), Markup.button.callback('Biểu đồ', 'report:chart')],
      [Markup.button.callback('Xuất CSV', 'report:export'), Markup.button.callback('⬅️ Menu chính', 'menu:main')],
    ]));
  });
  bot.action('menu:history', async (ctx) => {
    await ctx.answerCbQuery();
    const rows = await getRecentTransactions({
      ledgerId: ctx.state.ledger.id,
      limit: 10,
      timezone: config.timezone,
    });
    return ctx.reply(rows.length
      ? formatRecentTransactions(rows, `🕘 ${rows.length} GIAO DỊCH GẦN NHẤT`)
      : '📭 Sổ này chưa có giao dịch.');
  });
  bot.action('menu:plans', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('🎯 KẾ HOẠCH TÀI CHÍNH', Markup.inlineKeyboard([
      [Markup.button.callback('Ngân sách', 'plan:budget'), Markup.button.callback('Công nợ', 'plan:debts')],
      [Markup.button.callback('Định kỳ', 'plan:recurring'), Markup.button.callback('Nhắc nhở', 'plan:reminders')],
      [Markup.button.callback('⬅️ Menu chính', 'menu:main')],
    ]));
  });
  bot.action('menu:settings', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('⚙️ CÀI ĐẶT', Markup.inlineKeyboard([
      [Markup.button.callback('OCR hóa đơn', 'settings:ocr'), Markup.button.callback('Phong cách bot', 'settings:style')],
      [Markup.button.callback('Quota AI', 'settings:quota'), Markup.button.callback('Quyền riêng tư', 'settings:privacy')],
      [Markup.button.callback('⬅️ Menu chính', 'menu:main')],
    ]));
  });
  bot.action('menu:help', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply(helpMessage);
  });
  bot.action('report:current', async (ctx) => {
    await ctx.answerCbQuery();
    const { month, year } = getCurrentMonth(config.timezone);
    const reportParams = { ledgerId: ctx.state.ledger.id, month, year, timezone: config.timezone };
    const [rows, budgetRows] = await Promise.all([
      getMonthlySummary(reportParams),
      getBudgetStatus(reportParams),
    ]);
    if (!rows.length) return ctx.reply(`📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
    return ctx.reply(
      formatMonthlyReport(rows, month, year, ctx.state.ledger.name, budgetRows),
      monthlyReportKeyboard(ctx.state.ledger.id, month, year),
    );
  });
  bot.action('report:chart', async (ctx) => {
    await ctx.answerCbQuery();
    const { month, year } = getCurrentMonth(config.timezone);
    const rows = await getMonthlySummary({ ledgerId: ctx.state.ledger.id, month, year, timezone: config.timezone });
    const url = createChartUrl(rows, month, year);
    return url
      ? ctx.replyWithPhoto(url, { caption: `📊 Biểu đồ chi tiêu tháng ${month}/${year}` })
      : ctx.reply('📭 Tháng này chưa có khoản chi.');
  });
  bot.action('report:export', async (ctx) => {
    await ctx.answerCbQuery();
    const { month, year } = getCurrentMonth(config.timezone);
    const rows = await getMonthlyTransactions({ ledgerId: ctx.state.ledger.id, month, year, timezone: config.timezone });
    if (!rows.length) return ctx.reply('📭 Tháng này chưa có giao dịch.');
    const filename = `thu-chi-${String(month).padStart(2, '0')}-${year}.csv`;
    return ctx.replyWithDocument({ source: Buffer.from(transactionsToCsv(rows), 'utf8'), filename });
  });
  bot.action('plan:budget', async (ctx) => {
    await ctx.answerCbQuery();
    const { month, year } = getCurrentMonth(config.timezone);
    const rows = await getBudgetStatus({ ledgerId: ctx.state.ledger.id, month, year, timezone: config.timezone });
    return ctx.reply(`${formatBudgetStatus(rows, getCurrentDateParts(config.timezone))}\n\nĐặt mới: /ngansach 10tr hoặc /ngansach 1 3tr`);
  });
  bot.action('plan:debts', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Dùng /no để xem công nợ hoặc /no cho Nam 200k | tiền Grab để tạo mới.');
  });
  bot.action('plan:recurring', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Dùng /dinhky để xem hoặc /dinhky them chi 200k Internet | 5 để tạo mới.');
  });
  bot.action('plan:reminders', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Dùng /nhacnho on hoặc /nhacnho off.');
  });
  bot.action('settings:ocr', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getUser(ctx.from.id);
    const enable = !user?.ocr_consent;
    await updatePreference(ctx.from.id, 'ocr_consent', enable);
    return ctx.reply(enable ? '✅ Đã bật OCR.' : '🔒 Đã tắt OCR.');
  });
  bot.action('settings:style', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Chọn phong cách:', Markup.inlineKeyboard([[
      Markup.button.callback('Nhẹ nhàng', 'style:gentle'),
      Markup.button.callback('Hài hước', 'style:funny'),
      Markup.button.callback('Thẳng', 'style:direct'),
    ]]));
  });
  bot.action(/^style:(gentle|funny|direct)$/, async (ctx) => {
    await updatePreference(ctx.from.id, 'personality', ctx.match[1]);
    await ctx.answerCbQuery('Đã cập nhật');
    return ctx.editMessageText('🎭 Đã đổi phong cách bot.');
  });
  bot.action('settings:quota', async (ctx) => {
    await ctx.answerCbQuery();
    const usage = await getUsageStatus(ctx.from.id);
    return ctx.reply(`🤖 Text: ${usage.text}/${usage.textLimit}\nẢnh: ${usage.image}/${usage.imageLimit}`);
  });
  bot.action('settings:privacy', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('🔐 Ảnh chỉ xử lý trong RAM. Dữ liệu sổ chung chỉ thành viên có quyền mới truy cập được. Dùng /deletedata cho tài khoản cá nhân hoặc /xoaso cho sổ chung.');
  });
  bot.action(/^deleteall:(confirm|cancel)$/, async (ctx) => {
    if (ctx.match[1] === 'cancel') {
      await ctx.answerCbQuery('Đã hủy');
      return ctx.editMessageText('✅ Không có dữ liệu nào bị xóa.');
    }
    const result = await deleteAllUserData(ctx.from.id);
    if (result.blocked) {
      await ctx.answerCbQuery('Bạn vẫn đang sở hữu sổ chung.', { show_alert: true });
      return ctx.editMessageText(`⛔ Bạn đang sở hữu ${result.sharedLedgers} sổ chung. Hãy chuyển sang từng sổ và dùng /xoaso trước.`);
    }
    forgetUser(ctx.from.id);
    await ctx.answerCbQuery('Đã xóa');
    return ctx.editMessageText('🗑 Đã xóa sổ cá nhân, cài đặt và quyền thành viên của bạn. Dữ liệu đã ghi trong sổ chung vẫn thuộc sổ đó.');
  });
}

module.exports = { registerMenuHandlers };
