const { InputError } = require('../../../domain/errors');
const { parseAmount, formatMoney } = require('../../../utils/amount');
const { detectCategoryId, getCategoryName } = require('../../../utils/category');
const {
  getCommandArguments,
  parseTransactionInput,
  parsePositiveInteger,
} = require('../../../utils/command');
const { parseMonth, getCurrentMonth, getCurrentDateParts } = require('../../../utils/month');
const { transactionsToCsv } = require('../../../utils/csv');
const {
  formatMonthlyReport,
  createChartUrl,
  formatBudgetStatus,
} = require('../../../domain/services/report_service');
const { requireWritableLedger } = require('../context');
const {
  helpMessage,
  funnyComment,
  sendSaved,
  formatRecentTransactions,
  formatMonthlyTransactionDetails,
  monthlyReportKeyboard,
  monthlyReportDetailsKeyboard,
  showMainMenu,
} = require('../views');

function createBudgetWarning({ config, finance }) {
  return async function getBudgetWarning(ledgerId) {
    const { month, year } = getCurrentMonth(config.timezone);
    const rows = await finance.getBudgetStatus({
      ledgerId,
      month,
      year,
      timezone: config.timezone,
    });
    const warnings = [];
    for (const row of rows) {
      const ratio = Number(row.spent) / Number(row.amount);
      if (ratio < 0.8) continue;
      const label = row.category_id === null ? 'tổng ngân sách' : getCategoryName(row.category_id);
      warnings.push(ratio >= 1
        ? `🚨 Bạn đã vượt ${label} ${formatMoney(Number(row.spent) - Number(row.amount))}.`
        : `⚠️ Bạn đã dùng ${Math.round(ratio * 100)}% ${label}.`);
    }
    return warnings.join('\n');
  };
}

function parseDate(input) {
  if (!input) return null;
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new InputError('Ngày phải có dạng DD/MM/YYYY.');
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== Number(match[3])
    || parsed.getUTCMonth() + 1 !== Number(match[2])
    || parsed.getUTCDate() !== Number(match[1])
  ) throw new InputError('Ngày không hợp lệ.');
  return iso;
}

function registerFinanceHandlers(bot, {
  config,
  transactions,
  finance,
  ledgers,
  users,
  getBudgetWarning = createBudgetWarning({ config, finance }),
}) {
  const {
    createTransaction,
    getMonthlySummary,
    getMonthlyTransactions,
    getRecentTransactions,
    deleteTransaction,
  } = transactions;
  const {
    upsertBudget,
    getBudgetStatus,
    createDebt,
    payDebt,
    getOpenDebts,
    createRecurring,
    getRecurring,
    deleteRecurring,
    getExpenseStats,
  } = finance;
  const { getLedgerAccess } = ledgers;
  const { getUser } = users;
  async function handleCreateTransaction(ctx, type, command) {
    const ledger = requireWritableLedger(ctx);
    const { amountText, description } = parseTransactionInput(ctx.message.text, command);
    const amount = parseAmount(amountText);
    const categoryId = detectCategoryId(description, type);
    const user = await getUser(ctx.from.id);
    const sourceKey = `telegram:${ctx.chat.id}:${ctx.message.message_id}`;
    const saved = await createTransaction({
      userId: ctx.from.id,
      ledgerId: ledger.id,
      type,
      amount,
      categoryId,
      description,
      source: 'command',
      sourceKey,
    });
    if (!saved) return ctx.reply('✅ Tin nhắn này đã được xử lý trước đó.');
    let comment = funnyComment(type, categoryId, user?.personality);
    if (type === 'expense') {
      const stats = await getExpenseStats(ledger.id);
      if (stats.count >= 5 && stats.average > 0 && amount >= stats.average * 3) {
        comment += `${comment ? '\n' : ''}⚠️ Khoản này lớn hơn đáng kể so với mức chi trung bình 30 ngày.`;
      }
      const budgetWarning = await getBudgetWarning(ledger.id);
      if (budgetWarning) comment += `${comment ? '\n' : ''}${budgetWarning}`;
    }
    return sendSaved(ctx, saved, comment, ledger);
  }

  bot.start(async (ctx) => {
    await ctx.reply('👋 Chào bạn! Tôi là Quản gia Tài chính AI. Mỗi khoản tiền sẽ được ghi vào sổ đang chọn.');
    return showMainMenu(ctx);
  });
  bot.help((ctx) => ctx.reply(helpMessage));
  bot.command('id', (ctx) => ctx.reply(`Telegram User ID của bạn: ${ctx.from.id}`));
  bot.command('chi', (ctx) => handleCreateTransaction(ctx, 'expense', 'chi'));
  bot.command('thu', (ctx) => handleCreateTransaction(ctx, 'income', 'thu'));

  bot.command('baocao', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'baocao');
    const { month, year } = parseMonth(input, config.timezone);
    const rows = await getMonthlySummary({
      ledgerId: ctx.state.ledger.id,
      month,
      year,
      timezone: config.timezone,
    });
    if (!rows.length) return ctx.reply(`📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
    return ctx.reply(
      formatMonthlyReport(rows, month, year, ctx.state.ledger.name),
      monthlyReportKeyboard(ctx.state.ledger.id, month, year),
    );
  });
  bot.action(/^report:details:(\d+):(\d{4}):(\d{1,2}):(\d+)$/, async (ctx) => {
    const [, ledgerIdText, yearText, monthText, pageText] = ctx.match;
    const ledgerId = Number(ledgerIdText);
    const year = Number(yearText);
    const month = Number(monthText);
    if (month < 1 || month > 12) {
      return ctx.answerCbQuery('Tháng báo cáo không hợp lệ.', { show_alert: true });
    }
    const access = await getLedgerAccess(ctx.from.id, ledgerId);
    if (!access) {
      return ctx.answerCbQuery('Bạn không còn quyền xem sổ này.', { show_alert: true });
    }
    const rows = await getMonthlyTransactions({
      ledgerId,
      month,
      year,
      timezone: config.timezone,
    });
    if (!rows.length) {
      return ctx.answerCbQuery('Không còn giao dịch trong tháng này.', { show_alert: true });
    }
    const details = formatMonthlyTransactionDetails(rows, {
      month,
      year,
      ledgerName: access.name,
      page: Number(pageText),
    });
    await ctx.answerCbQuery();
    return ctx.editMessageText(details.text, {
      parse_mode: 'HTML',
      ...monthlyReportDetailsKeyboard(
        ledgerId,
        month,
        year,
        details.page,
        details.totalPages,
      ),
    });
  });
  bot.action(/^report:summary:(\d+):(\d{4}):(\d{1,2})$/, async (ctx) => {
    const [, ledgerIdText, yearText, monthText] = ctx.match;
    const ledgerId = Number(ledgerIdText);
    const year = Number(yearText);
    const month = Number(monthText);
    if (month < 1 || month > 12) {
      return ctx.answerCbQuery('Tháng báo cáo không hợp lệ.', { show_alert: true });
    }
    const access = await getLedgerAccess(ctx.from.id, ledgerId);
    if (!access) {
      return ctx.answerCbQuery('Bạn không còn quyền xem sổ này.', { show_alert: true });
    }
    const rows = await getMonthlySummary({
      ledgerId,
      month,
      year,
      timezone: config.timezone,
    });
    await ctx.answerCbQuery();
    if (!rows.length) return ctx.editMessageText('📭 Không còn giao dịch trong tháng này.');
    return ctx.editMessageText(
      formatMonthlyReport(rows, month, year, access.name),
      monthlyReportKeyboard(ledgerId, month, year),
    );
  });
  bot.command('bieudo', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'bieudo');
    const { month, year } = parseMonth(input, config.timezone);
    const rows = await getMonthlySummary({
      ledgerId: ctx.state.ledger.id,
      month,
      year,
      timezone: config.timezone,
    });
    const url = createChartUrl(rows, month, year);
    if (!url) return ctx.reply(`📭 Chưa có khoản chi nào trong tháng ${month}/${year}.`);
    return ctx.replyWithPhoto(url, {
      caption: `📊 Biểu đồ chi tiêu tháng ${month}/${year}. Dữ liệu tổng hợp được gửi tới QuickChart để tạo ảnh.`,
    });
  });
  bot.command('lichsu', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'lichsu');
    const limit = input ? parsePositiveInteger(input, 'Số giao dịch') : 10;
    if (limit > 20) throw new InputError('Chỉ có thể xem tối đa 20 giao dịch mỗi lần.');
    const rows = await getRecentTransactions({
      ledgerId: ctx.state.ledger.id,
      limit,
      timezone: config.timezone,
    });
    if (!rows.length) return ctx.reply('📭 Bạn chưa có giao dịch nào.');
    return ctx.reply(formatRecentTransactions(rows, `🕘 ${rows.length} GIAO DỊCH GẦN NHẤT`));
  });
  bot.command('xoa', async (ctx) => {
    requireWritableLedger(ctx);
    const transactionId = parsePositiveInteger(
      getCommandArguments(ctx.message.text, 'xoa'),
      'Mã giao dịch',
    );
    const deleted = await deleteTransaction({
      userId: ctx.from.id,
      ledgerId: ctx.state.ledger.id,
      transactionId,
    });
    return ctx.reply(deleted
      ? `🗑 Đã xóa giao dịch #${deleted.id}: ${formatMoney(deleted.amount)} — ${deleted.description}`
      : `❌ Không tìm thấy giao dịch #${transactionId} hoặc bạn không có quyền xóa.`);
  });
  bot.command('export', async (ctx) => {
    const { month, year } = parseMonth(
      getCommandArguments(ctx.message.text, 'export'),
      config.timezone,
    );
    const rows = await getMonthlyTransactions({
      ledgerId: ctx.state.ledger.id,
      month,
      year,
      timezone: config.timezone,
    });
    if (!rows.length) return ctx.reply(`📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
    const filename = `thu-chi-${String(month).padStart(2, '0')}-${year}.csv`;
    return ctx.replyWithDocument(
      { source: Buffer.from(transactionsToCsv(rows), 'utf8'), filename },
      { caption: `📄 Dữ liệu thu chi tháng ${month}/${year}` },
    );
  });
  bot.command('ngansach', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'ngansach');
    const { month, year } = getCurrentMonth(config.timezone);
    if (!input) {
      const rows = await getBudgetStatus({
        ledgerId: ctx.state.ledger.id,
        month,
        year,
        timezone: config.timezone,
      });
      return ctx.reply(formatBudgetStatus(rows, getCurrentDateParts(config.timezone)));
    }
    const parts = input.split(/\s+/);
    const categoryId = parts.length === 1 ? null : Number(parts[0]);
    const amount = parseAmount(parts.length === 1 ? parts[0] : parts[1]);
    if (categoryId !== null && ![1, 2, 3, 4, 5, 6, 7, 99].includes(categoryId)) {
      throw new InputError('Danh mục phải là 1–7 hoặc 99. Gõ /help để xem hướng dẫn.');
    }
    const ledger = requireWritableLedger(ctx);
    await upsertBudget({ userId: ctx.from.id, ledgerId: ledger.id, categoryId, amount, month, year });
    const label = categoryId === null ? 'tổng chi' : getCategoryName(categoryId);
    return ctx.reply(`🎯 Đã đặt ngân sách ${label} tháng ${month}/${year}: ${formatMoney(amount)}.`);
  });
  bot.command('no', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'no');
    if (!input) {
      const rows = await getOpenDebts(ctx.state.ledger.id);
      if (!rows.length) return ctx.reply('🎉 Không có khoản nợ đang mở. Ví và tâm trí đều nhẹ!');
      return ctx.reply(['🤝 CÔNG NỢ ĐANG MỞ', '', ...rows.map((row) => {
        const label = Number(row.debt_type) === 1
          ? `${row.person_name} nợ bạn`
          : `Bạn nợ ${row.person_name}`;
        return `#${row.id} · ${label}: ${formatMoney(row.remaining_amount)}${row.due_date ? `\nHạn: ${String(row.due_date).slice(0, 10)}` : ''}`;
      })].join('\n\n'));
    }
    const [main, description = '', dueText = ''] = input.split('|').map((part) => part.trim());
    const parts = main.split(/\s+/);
    const action = parts.shift()?.toLowerCase();
    if (action === 'tra') {
      const debtId = parsePositiveInteger(parts[0], 'Mã khoản nợ');
      const amount = parseAmount(parts[1]);
      const ledger = requireWritableLedger(ctx);
      const result = await payDebt({ userId: ctx.from.id, ledgerId: ledger.id, debtId, amount });
      if (!result) return ctx.reply(`❌ Không tìm thấy khoản nợ đang mở #${debtId}.`);
      return ctx.reply(`✅ Đã ghi trả ${formatMoney(result.payment)} cho khoản #${debtId}. Còn lại: ${formatMoney(result.remaining_amount)}.`);
    }
    if (!['cho', 'vay'].includes(action) || parts.length < 2) {
      throw new InputError('Ví dụ: /no cho Nam 200k | tiền Grab | 30/10/2026');
    }
    const amount = parseAmount(parts.pop());
    const personName = parts.join(' ').slice(0, 80);
    const ledger = requireWritableLedger(ctx);
    const debt = await createDebt({
      userId: ctx.from.id,
      ledgerId: ledger.id,
      personName,
      debtType: action === 'cho' ? 1 : 2,
      amount,
      description: description.slice(0, 120),
      dueDate: parseDate(dueText),
    });
    return ctx.reply(`🤝 Đã tạo khoản #${debt.id}: ${action === 'cho' ? `${personName} nợ bạn` : `bạn nợ ${personName}`} ${formatMoney(amount)}.`);
  });
  bot.command('dinhky', async (ctx) => {
    const input = getCommandArguments(ctx.message.text, 'dinhky');
    if (!input) {
      const rows = await getRecurring(ctx.state.ledger.id);
      if (!rows.length) return ctx.reply('📭 Chưa có giao dịch định kỳ.');
      return ctx.reply(['🔁 GIAO DỊCH ĐỊNH KỲ', '', ...rows.map((row) => `#${row.id} · ngày ${row.day_of_month} · ${row.transaction_type === 'expense' ? 'Chi' : 'Thu'} ${formatMoney(row.amount)} · ${row.description}`)].join('\n'));
    }
    const [main, dayText] = input.split('|').map((part) => part.trim());
    const parts = main.split(/\s+/);
    const action = parts.shift()?.toLowerCase();
    if (action === 'xoa') {
      const recurringId = parsePositiveInteger(parts[0], 'Mã định kỳ');
      const ledger = requireWritableLedger(ctx);
      const deleted = await deleteRecurring({ userId: ctx.from.id, ledgerId: ledger.id, recurringId });
      return ctx.reply(deleted ? `🗑 Đã xóa giao dịch định kỳ #${recurringId}.` : `❌ Không tìm thấy #${recurringId}.`);
    }
    if (action !== 'them' || parts.length < 3 || !dayText) {
      throw new InputError('Ví dụ: /dinhky them chi 200k Internet | 5');
    }
    const typeText = parts.shift().toLowerCase();
    const type = typeText === 'chi' ? 'expense' : typeText === 'thu' ? 'income' : null;
    if (!type) throw new InputError('Loại định kỳ phải là chi hoặc thu.');
    const amount = parseAmount(parts.shift());
    const description = parts.join(' ').slice(0, 120);
    const dayOfMonth = Number(dayText);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      throw new InputError('Ngày định kỳ phải từ 1 đến 31.');
    }
    const ledger = requireWritableLedger(ctx);
    const saved = await createRecurring({
      userId: ctx.from.id,
      ledgerId: ledger.id,
      type,
      amount,
      categoryId: detectCategoryId(description, type),
      description,
      dayOfMonth,
    });
    return ctx.reply(`🔁 Đã tạo định kỳ #${saved.id}, nhắc vào ngày ${dayOfMonth} hằng tháng. Bot sẽ hỏi trước khi ghi.`);
  });
}

module.exports = { registerFinanceHandlers, createBudgetWarning };
