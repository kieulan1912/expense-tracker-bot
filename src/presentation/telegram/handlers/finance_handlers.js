const { Markup } = require('telegraf');
const { InputError } = require('../../../domain/errors');
const { parseAmount, formatMoney } = require('../../../utils/amount');
const { detectCategoryId, getCategoryName } = require('../../../utils/category');
const {
  getCommandArguments,
  parseTransactionInput,
  parseMultipleExpenseInput,
  parsePositiveInteger,
} = require('../../../utils/command');
const { parseSearchInput } = require('../../../utils/search');
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
const {
  debtListView,
  debtCandidateKeyboard,
  requestDebtPaymentConfirmation,
  requestDebtCancellation,
  requestTransactionChange,
} = require('../action_flows');

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
  pendingStore,
  getBudgetWarning = createBudgetWarning({ config, finance }),
}) {
  const {
    createTransaction,
    getMonthlySummary,
    getMonthlyTransactions,
    getRecentTransactions,
    searchTransactions,
    getTransactionById,
  } = transactions;
  const {
    upsertBudget,
    getBudgetStatus,
    createDebt,
    getOpenDebts,
    getDebtById,
    getDebtDetails,
    findOpenDebts,
    createRecurring,
    getRecurring,
    deleteRecurring,
    getExpenseStats,
  } = finance;
  const { getLedgerAccess } = ledgers;
  const { getUser } = users;
  const { createPending, setInput, consumeInput } = pendingStore;
  async function handleCreateTransaction(ctx, type, command) {
    const ledger = requireWritableLedger(ctx);
    const multiple = type === 'expense' ? parseMultipleExpenseInput(ctx.message.text) : null;
    if (multiple) {
      const items = multiple.map((item) => ({
        type,
        amount: item.amount,
        categoryId: detectCategoryId(item.description, type),
        description: item.description,
        personName: item.personName,
      }));
      const token = createPending(ctx.from.id, {
        kind: 'transactions',
        ledgerId: ledger.id,
        items,
        source: 'command',
        sourceKey: `telegram:${ctx.chat.id}:${ctx.message.message_id}`,
      });
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      return ctx.reply([
        `🔎 Tôi hiểu có ${items.length} khoản chi:`, '',
        ...items.map((item, index) => `${index + 1}. ${item.description}: ${formatMoney(item.amount)}`),
        '', `Tổng: ${formatMoney(total)}`,
      ].join('\n'), Markup.inlineKeyboard([
        Markup.button.callback(`✅ Lưu ${items.length} khoản`, `pending:save:${token}`),
        Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
      ]));
    }
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
      counterpartyName: type === 'expense'
        ? description.match(/^(?:biếu|tặng|cho)\s+(.+)$/iu)?.[1]?.trim().slice(0, 80) || null
        : null,
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
    const reportParams = {
      ledgerId: ctx.state.ledger.id, month, year, timezone: config.timezone,
    };
    const [rows, budgetRows] = await Promise.all([
      getMonthlySummary(reportParams),
      getBudgetStatus(reportParams),
    ]);
    const asOfDateParts = getCurrentDateParts(config.timezone);
    if (!rows.length) return ctx.reply(`📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
    return ctx.reply(
      formatMonthlyReport(
        rows, month, year, ctx.state.ledger.name, budgetRows, asOfDateParts,
      ),
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
    const reportParams = { ledgerId, month, year, timezone: config.timezone };
    const [rows, budgetRows] = await Promise.all([
      getMonthlySummary(reportParams),
      getBudgetStatus(reportParams),
    ]);
    const asOfDateParts = getCurrentDateParts(config.timezone);
    await ctx.answerCbQuery();
    if (!rows.length) return ctx.editMessageText('📭 Không còn giao dịch trong tháng này.');
    return ctx.editMessageText(
      formatMonthlyReport(rows, month, year, access.name, budgetRows, asOfDateParts),
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
    const adjustableRows = ctx.state.ledger.role === 'owner'
      ? rows
      : ctx.state.ledger.role === 'member'
        ? rows.filter((row) => String(row.created_by_user_id) === String(ctx.from.id))
        : [];
    return ctx.reply(
      formatRecentTransactions(rows, `🕘 ${rows.length} GIAO DỊCH GẦN NHẤT`),
      Markup.inlineKeyboard(adjustableRows.slice(0, 8).map((row) => [
        Markup.button.callback(`⚙️ Điều chỉnh #${row.id}`, `tx:menu:${row.id}`),
      ])),
    );
  });
  bot.command('tim', async (ctx) => {
    const filters = parseSearchInput(getCommandArguments(ctx.message.text, 'tim'));
    const rows = await searchTransactions({
      ledgerId: ctx.state.ledger.id,
      ...filters,
      timezone: config.timezone,
    });
    if (!rows.length) return ctx.reply('📭 Không tìm thấy giao dịch phù hợp.');
    return ctx.reply(formatRecentTransactions(rows, `🔎 TÌM THẤY ${rows.length} GIAO DỊCH`));
  });
  bot.command('xoa', async (ctx) => {
    requireWritableLedger(ctx);
    const transactionId = parsePositiveInteger(
      getCommandArguments(ctx.message.text, 'xoa'),
      'Mã giao dịch',
    );
    const transaction = await getTransactionById({
      ledgerId: ctx.state.ledger.id,
      transactionId,
    });
    if (!transaction) return ctx.reply(`❌ Không tìm thấy giao dịch #${transactionId}.`);
    if (ctx.state.ledger.role !== 'owner'
      && String(transaction.created_by_user_id) !== String(ctx.from.id)) {
      throw new InputError('Bạn chỉ có thể hủy giao dịch do mình tạo.');
    }
    return requestTransactionChange(ctx, {
      transaction,
      reason: 'Hủy bằng lệnh /xoa',
      createPending,
    });
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
      const view = debtListView(rows, {
        userId: ctx.from.id,
        role: ctx.state.ledger.role,
      });
      return ctx.reply(view.text, view.keyboard);
    }
    const [main, description = '', dueText = ''] = input.split('|').map((part) => part.trim());
    const parts = main.split(/\s+/);
    const action = parts.shift()?.toLowerCase();
    if (['tra', 'tattoan'].includes(action)) {
      const ledger = requireWritableLedger(ctx);
      const isFull = action === 'tattoan';
      if ((!isFull && parts.length < 2) || (isFull && parts.length < 1)) {
        throw new InputError('Ví dụ: /no tra Nam 40k hoặc /no tattoan Nam');
      }
      const amount = isFull ? null : parseAmount(parts.pop());
      const target = parts.join(' ').replace(/^#/, '').trim();
      const debts = /^\d+$/.test(target)
        ? [await getDebtById({ ledgerId: ledger.id, debtId: Number(target) })].filter((debt) => debt?.status === 'open')
        : await findOpenDebts({ ledgerId: ledger.id, personName: target });
      if (!debts.length) return ctx.reply(`❌ Không tìm thấy khoản nợ đang mở của “${target}”.`);
      if (debts.length > 1) {
        return ctx.reply(
          `Tìm thấy ${debts.length} khoản phù hợp. Hãy chọn đúng khoản cần ${isFull ? 'tất toán' : 'thanh toán'}:`,
          debtCandidateKeyboard(debts, isFull ? 'full' : 'partial', amount),
        );
      }
      return requestDebtPaymentConfirmation(ctx, {
        debt: debts[0],
        amount: isFull ? Number(debts[0].remaining_amount) : amount,
        createPending,
      });
    }
    const debtTypeByAction = {
      cho: 1,
      vay: 2,
      'phai-thu': 1,
      'phai-tra': 2,
    };
    if (!debtTypeByAction[action] || parts.length < 2) {
      throw new InputError('Ví dụ: /no phai-thu Nam 200k | tiền Grab | 30/10/2026');
    }
    const amount = parseAmount(parts.pop());
    const personName = parts.join(' ').slice(0, 80);
    const ledger = requireWritableLedger(ctx);
    const debt = await createDebt({
      userId: ctx.from.id,
      ledgerId: ledger.id,
      personName,
      debtType: debtTypeByAction[action],
      amount,
      description: description.slice(0, 120),
      dueDate: parseDate(dueText),
    });
    return ctx.reply(`🤝 Đã tạo khoản #${debt.id}: ${debtTypeByAction[action] === 1 ? `${personName} nợ bạn` : `bạn nợ ${personName}`} ${formatMoney(amount)}.`);
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

  bot.action(/^debt:(partial|full|cancel):(\d+)$/, async (ctx) => {
    requireWritableLedger(ctx);
    const action = ctx.match[1];
    const debt = await getDebtById({
      ledgerId: ctx.state.ledger.id,
      debtId: Number(ctx.match[2]),
    });
    if (!debt || debt.status !== 'open') {
      return ctx.answerCbQuery('Khoản công nợ không còn mở.', { show_alert: true });
    }
    await ctx.answerCbQuery();
    if (action === 'partial') {
      setInput(ctx.from.id, {
        kind: 'debt_payment_amount',
        ledgerId: debt.ledger_id,
        debtId: Number(debt.id),
      });
      return ctx.reply(
        `Nhập số tiền đã thanh toán cho khoản #${debt.id} (còn ${formatMoney(debt.remaining_amount)}).`,
        { reply_markup: { force_reply: true, selective: true } },
      );
    }
    if (action === 'cancel') {
      return requestDebtCancellation(ctx, { debt, createPending });
    }
    return requestDebtPaymentConfirmation(ctx, {
      debt,
      amount: Number(debt.remaining_amount),
      createPending,
    });
  });

  bot.action(/^debt:list:(\d+)$/, async (ctx) => {
    const rows = await getOpenDebts(ctx.state.ledger.id);
    if (!rows.length) {
      await ctx.answerCbQuery();
      return ctx.editMessageText('🎉 Không còn khoản nợ đang mở.');
    }
    const view = debtListView(rows, {
      userId: ctx.from.id,
      role: ctx.state.ledger.role,
      page: Number(ctx.match[1]),
    });
    await ctx.answerCbQuery();
    return ctx.editMessageText(view.text, view.keyboard);
  });

  bot.action(/^debt:details:(\d+)$/, async (ctx) => {
    const debt = await getDebtDetails({
      ledgerId: ctx.state.ledger.id,
      debtId: Number(ctx.match[1]),
      timezone: config.timezone,
    });
    if (!debt) {
      return ctx.answerCbQuery('Không tìm thấy khoản công nợ.', { show_alert: true });
    }
    const paid = Number(debt.original_amount) - Number(debt.remaining_amount);
    const paymentLines = debt.payments.length
      ? debt.payments.map((payment) =>
        `• ${formatMoney(payment.amount)} · ${payment.paid_at} · ${payment.created_by_name}`)
      : ['• Chưa có lần thanh toán nào'];
    await ctx.answerCbQuery();
    return ctx.reply([
      `🤝 CHI TIẾT CÔNG NỢ #${debt.id}`, '',
      Number(debt.debt_type) === 1 ? `${debt.person_name} nợ bạn` : `Bạn nợ ${debt.person_name}`,
      `Ban đầu: ${formatMoney(debt.original_amount)}`,
      `Đã trả: ${formatMoney(paid)}`,
      `Còn lại: ${formatMoney(debt.remaining_amount)}`,
      ...(debt.description ? [`Lý do: ${debt.description}`] : []),
      '', 'LỊCH SỬ THANH TOÁN', ...paymentLines,
    ].join('\n'));
  });

  bot.action(/^debt:choose:(partial|full):(\d+):(\d+)$/, async (ctx) => {
    requireWritableLedger(ctx);
    const [, action, debtIdText, amountText] = ctx.match;
    const debt = await getDebtById({
      ledgerId: ctx.state.ledger.id,
      debtId: Number(debtIdText),
    });
    if (!debt || debt.status !== 'open') {
      return ctx.answerCbQuery('Khoản công nợ không còn mở.', { show_alert: true });
    }
    await ctx.answerCbQuery();
    return requestDebtPaymentConfirmation(ctx, {
      debt,
      amount: action === 'full' ? Number(debt.remaining_amount) : Number(amountText),
      createPending,
    });
  });

  bot.action(/^tx:menu:(\d+)$/, async (ctx) => {
    requireWritableLedger(ctx);
    const transaction = await getTransactionById({
      ledgerId: ctx.state.ledger.id,
      transactionId: Number(ctx.match[1]),
    });
    if (!transaction) {
      return ctx.answerCbQuery('Giao dịch không còn tồn tại.', { show_alert: true });
    }
    if (ctx.state.ledger.role !== 'owner'
      && String(transaction.created_by_user_id) !== String(ctx.from.id)) {
      return ctx.answerCbQuery('Bạn chỉ có thể sửa giao dịch do mình tạo.', { show_alert: true });
    }
    await ctx.answerCbQuery();
    return ctx.reply(
      `Giao dịch #${transaction.id}\n${formatMoney(transaction.amount)} · ${transaction.description}`,
      Markup.inlineKeyboard([
        Markup.button.callback('✏️ Sửa số tiền', `tx:adjust:${transaction.id}`),
        Markup.button.callback('🚫 Hủy giao dịch', `tx:cancel:${transaction.id}`),
      ]),
    );
  });

  bot.action(/^tx:(adjust|cancel):(\d+)$/, async (ctx) => {
    requireWritableLedger(ctx);
    const action = ctx.match[1];
    const transaction = await getTransactionById({
      ledgerId: ctx.state.ledger.id,
      transactionId: Number(ctx.match[2]),
    });
    if (!transaction) {
      return ctx.answerCbQuery('Giao dịch không còn tồn tại.', { show_alert: true });
    }
    if (ctx.state.ledger.role !== 'owner'
      && String(transaction.created_by_user_id) !== String(ctx.from.id)) {
      return ctx.answerCbQuery('Bạn chỉ có thể sửa giao dịch do mình tạo.', { show_alert: true });
    }
    await ctx.answerCbQuery();
    if (action === 'cancel') {
      return requestTransactionChange(ctx, {
        transaction,
        reason: 'Hủy từ lịch sử giao dịch',
        createPending,
      });
    }
    setInput(ctx.from.id, {
      kind: 'transaction_adjust_amount',
      ledgerId: transaction.ledger_id,
      transactionId: Number(transaction.id),
    });
    return ctx.reply(
      `Nhập số tiền mới cho giao dịch #${transaction.id}. Có thể thêm ghi chú sau dấu |.\nVí dụ: 500k | biếu bà`,
      { reply_markup: { force_reply: true, selective: true } },
    );
  });

  async function handleFinanceTextInput(ctx) {
    const input = consumeInput(ctx.from.id);
    if (!input) return false;
    requireWritableLedger(ctx);
    if (Number(input.ledgerId) !== Number(ctx.state.ledger.id)) {
      throw new InputError('Bạn đã đổi sổ. Hãy mở lại thao tác trong sổ hiện tại.');
    }
    if (input.kind === 'debt_payment_amount') {
      const debt = await getDebtById({ ledgerId: input.ledgerId, debtId: input.debtId });
      if (!debt || debt.status !== 'open') throw new InputError('Khoản công nợ không còn mở.');
      let amount;
      try {
        amount = parseAmount(ctx.message.text);
      } catch (error) {
        setInput(ctx.from.id, input);
        throw error;
      }
      await requestDebtPaymentConfirmation(ctx, {
        debt,
        amount,
        createPending,
      });
      return true;
    }
    if (input.kind === 'transaction_adjust_amount') {
      const [amountText, description = ''] = ctx.message.text.split('|').map((part) => part.trim());
      const transaction = await getTransactionById({
        ledgerId: input.ledgerId,
        transactionId: input.transactionId,
      });
      if (!transaction) throw new InputError('Giao dịch không còn tồn tại.');
      let newAmount;
      try {
        newAmount = parseAmount(amountText);
      } catch (error) {
        setInput(ctx.from.id, input);
        throw error;
      }
      await requestTransactionChange(ctx, {
        transaction,
        newAmount,
        newDescription: description || null,
        reason: 'Điều chỉnh từ lịch sử giao dịch',
        createPending,
      });
      return true;
    }
    return false;
  }

  return handleFinanceTextInput;
}

module.exports = { registerFinanceHandlers, createBudgetWarning };
