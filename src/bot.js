const { Telegraf } = require('telegraf');
const { config } = require('./config');
const { InputError } = require('./errors');
const {
  createTransaction,
  getMonthlySummary,
  getMonthlyTransactions,
  getRecentTransactions,
  deleteTransaction,
} = require('./transaction_repository');
const { parseAmount, formatMoney } = require('./utils/amount');
const { detectCategory } = require('./utils/category');
const {
  getCommandArguments,
  parseTransactionInput,
  parsePositiveInteger,
} = require('./utils/command');
const { parseMonth } = require('./utils/month');
const { transactionsToCsv } = require('./utils/csv');

const bot = new Telegraf(config.telegramBotToken);

const helpMessage = [
  '📖 HƯỚNG DẪN SỬ DỤNG',
  '',
  '/chi 50k phở bò — ghi một khoản chi',
  '/thu 15tr lương tháng 10 — ghi một khoản thu',
  '/baocao — báo cáo tháng hiện tại',
  '/baocao 10/2026 — báo cáo tháng chỉ định',
  '/lichsu — xem 10 giao dịch gần nhất',
  '/xoa 123 — xóa giao dịch có mã #123',
  '/export — xuất CSV tháng hiện tại',
  '/export 10/2026 — xuất CSV tháng chỉ định',
  '/id — xem Telegram User ID',
].join('\n');

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString();

  if (!userId) {
    return;
  }

  if (
    config.allowedUserIds.size > 0 &&
    !config.allowedUserIds.has(userId)
  ) {
    await ctx.reply('⛔ Bạn không có quyền sử dụng bot này.');
    return;
  }

  await next();
});

bot.start(async (ctx) => {
  await ctx.reply(
    ['👋 Chào bạn! Tôi là bot quản lý thu chi cá nhân.', '', helpMessage].join(
      '\n',
    ),
  );
});

bot.help(async (ctx) => {
  await ctx.reply(helpMessage);
});

bot.command('id', async (ctx) => {
  await ctx.reply(`Telegram User ID của bạn: ${ctx.from.id}`);
});

async function handleCreateTransaction(ctx, type, command) {
  const { amountText, description } = parseTransactionInput(
    ctx.message.text,
    command,
  );
  const amount = parseAmount(amountText);
  const category = detectCategory(description, type);
  const saved = await createTransaction({
    userId: ctx.from.id,
    type,
    amount,
    category,
    description,
  });
  const typeLabel = type === 'expense' ? 'khoản chi' : 'khoản thu';

  await ctx.reply(
    [
      `✅ Đã ghi nhận ${typeLabel}`,
      '',
      `💰 Số tiền: ${formatMoney(amount)}`,
      `🏷 Danh mục: ${category}`,
      `📝 Ghi chú: ${description}`,
      `🔖 Mã giao dịch: #${saved.id}`,
    ].join('\n'),
  );
}

bot.command('chi', async (ctx) => {
  await handleCreateTransaction(ctx, 'expense', 'chi');
});

bot.command('thu', async (ctx) => {
  await handleCreateTransaction(ctx, 'income', 'thu');
});

bot.command('baocao', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'baocao');
  const { month, year } = parseMonth(input, config.timezone);
  const rows = await getMonthlySummary({
    userId: ctx.from.id,
    month,
    year,
    timezone: config.timezone,
  });

  if (rows.length === 0) {
    await ctx.reply(`📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
    return;
  }

  const incomeRows = rows.filter((row) => row.transaction_type === 'income');
  const expenseRows = rows.filter((row) => row.transaction_type === 'expense');
  const income = incomeRows.reduce((sum, row) => sum + Number(row.total), 0);
  const expense = expenseRows.reduce((sum, row) => sum + Number(row.total), 0);
  const lines = [`📊 BÁO CÁO THÁNG ${month}/${year}`, ''];

  if (incomeRows.length > 0) {
    lines.push('📥 KHOẢN THU');
    lines.push(
      ...incomeRows.map(
        (row) => `• ${row.category}: ${formatMoney(row.total)}`,
      ),
    );
    lines.push('');
  }

  if (expenseRows.length > 0) {
    lines.push('📤 KHOẢN CHI');
    lines.push(
      ...expenseRows.map(
        (row) => `• ${row.category}: ${formatMoney(row.total)}`,
      ),
    );
    lines.push('');
  }

  lines.push(`Tổng thu: ${formatMoney(income)}`);
  lines.push(`Tổng chi: ${formatMoney(expense)}`);
  lines.push(`Số dư: ${formatMoney(income - expense)}`);

  await ctx.reply(lines.join('\n'));
});

bot.command('lichsu', async (ctx) => {
  const rows = await getRecentTransactions({
    userId: ctx.from.id,
    limit: 10,
    timezone: config.timezone,
  });

  if (rows.length === 0) {
    await ctx.reply('📭 Bạn chưa có giao dịch nào.');
    return;
  }

  const lines = rows.map((row) => {
    const icon = row.transaction_type === 'expense' ? '📤' : '📥';
    const shortDescription =
      row.description.length > 100
        ? `${row.description.slice(0, 97)}...`
        : row.description;
    return [
      `${icon} #${row.id} · ${formatMoney(row.amount)}`,
      `${row.category} · ${shortDescription}`,
      row.local_created_at,
    ].join('\n');
  });

  await ctx.reply(['🕘 10 GIAO DỊCH GẦN NHẤT', '', ...lines].join('\n\n'));
});

bot.command('xoa', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'xoa');
  const transactionId = parsePositiveInteger(input, 'Mã giao dịch');
  const deleted = await deleteTransaction({
    userId: ctx.from.id,
    transactionId,
  });

  if (!deleted) {
    await ctx.reply(`❌ Không tìm thấy giao dịch #${transactionId}.`);
    return;
  }

  await ctx.reply(
    `🗑 Đã xóa giao dịch #${deleted.id}: ${formatMoney(deleted.amount)} — ${deleted.description}`,
  );
});

bot.command('export', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'export');
  const { month, year } = parseMonth(input, config.timezone);
  const rows = await getMonthlyTransactions({
    userId: ctx.from.id,
    month,
    year,
    timezone: config.timezone,
  });

  if (rows.length === 0) {
    await ctx.reply(`📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
    return;
  }

  const csv = transactionsToCsv(rows);
  const filename = `thu-chi-${String(month).padStart(2, '0')}-${year}.csv`;

  await ctx.replyWithDocument(
    { source: Buffer.from(csv, 'utf8'), filename },
    { caption: `📄 Dữ liệu thu chi tháng ${month}/${year}` },
  );
});

bot.catch(async (error, ctx) => {
  if (error instanceof InputError) {
    await ctx.reply(`❌ ${error.message}`);
    return;
  }

  console.error('Telegram handler error:', error);

  try {
    await ctx.reply('❌ Đã có lỗi xảy ra. Vui lòng thử lại sau.');
  } catch (replyError) {
    console.error('Không thể gửi thông báo lỗi:', replyError);
  }
});

module.exports = { bot };
