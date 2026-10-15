const { Telegraf, Markup } = require('telegraf');
const { config } = require('./config');
const { InputError } = require('./errors');
const {
  createTransaction, createTransactions, getMonthlySummary,
  getMonthlyTransactions, getRecentTransactions, deleteTransaction,
  deleteAllUserData,
} = require('./transaction_repository');
const {
  upsertBudget, getBudgetStatus, createDebt, payDebt, getOpenDebts,
  createRecurring, getRecurring, deleteRecurring, getRecurringById,
  getExpenseStats,
} = require('./finance_repository');
const { ensureUser, getUser, updatePreference } = require('./user_repository');
const { analyzeText, analyzeImage, getUsageStatus } = require('./ai_service');
const { createPending, consumePending, cancelPending } = require('./pending_store');
const { parseAmount, formatMoney } = require('./utils/amount');
const { detectCategoryId, getCategoryName, isSensitiveCategory } = require('./utils/category');
const { getCommandArguments, parseTransactionInput, parsePositiveInteger } = require('./utils/command');
const { parseMonth, getCurrentMonth, getCurrentDateParts } = require('./utils/month');
const { transactionsToCsv } = require('./utils/csv');
const { formatMonthlyReport, createChartUrl, formatBudgetStatus } = require('./report_service');
const { resolveImageMime, looksLikeSupportedImage } = require('./utils/image');

const bot = new Telegraf(config.telegramBotToken);
const initializedUsers = new Set();
const rateWindows = new Map();

const helpMessage = [
  '📖 QUẢN GIA TÀI CHÍNH AI', '',
  'Ghi nhanh:',
  '/chi 50k phở bò',
  '/thu 15tr lương tháng 10',
  'Hoặc nhắn tự nhiên: “sáng nay phở 50k, cafe 35k”', '',
  'Báo cáo:',
  '/baocao [MM/YYYY] · /bieudo [MM/YYYY]',
  '/lichsu [số lượng] · /export [MM/YYYY] · /xoa ID', '',
  'Kế hoạch:',
  '/ngansach — xem ngân sách',
  '/ngansach 10tr — đặt tổng ngân sách',
  '/ngansach 1 3tr — đặt 3tr cho Ăn uống', '',
  'Công nợ:',
  '/no — danh sách',
  '/no cho Nam 200k | tiền Grab | 30/10/2026',
  '/no vay Lan 1tr | tiền nhà',
  '/no tra ID 100k', '',
  'Tự động:',
  '/dinhky — danh sách',
  '/dinhky them chi 200k Internet | 5',
  '/dinhky xoa ID · /nhacnho on|off', '',
  'Cài đặt:',
  '/phongcach nhe|haihuoc|thang',
  '/ocr on|off — bật/tắt đọc ảnh hóa đơn',
  '/aiquota — xem lượt AI hôm nay',
  '/quyenriengtu · /deletedata · /id',
].join('\n');

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;
  if (config.allowedUserIds.size > 0 && !config.allowedUserIds.has(userId)) {
    await ctx.reply('⛔ Bạn không có quyền sử dụng bot này.');
    return;
  }
  const now = Date.now();
  const current = rateWindows.get(userId);
  const window = !current || now - current.startedAt >= 60_000
    ? { startedAt: now, count: 0 }
    : current;
  window.count += 1;
  rateWindows.set(userId, window);
  if (window.count > config.botRateLimitPerMinute) {
    if (window.count === config.botRateLimitPerMinute + 1) {
      await ctx.reply('⏳ Bạn thao tác hơi nhanh. Vui lòng chờ khoảng một phút.');
    }
    return;
  }
  if (!initializedUsers.has(userId)) {
    await ensureUser({ userId, chatId: ctx.chat?.id || ctx.from.id });
    initializedUsers.add(userId);
  }
  await next();
});

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

async function sendSaved(ctx, saved, comment = '') {
  const list = Array.isArray(saved) ? saved : [saved];
  const lines = ['✅ Đã ghi nhận', ''];
  for (const item of list) {
    lines.push(...transactionLines({
      type: item.transaction_type,
      amount: item.amount,
      categoryId: item.category_id,
      description: item.description,
    }), `🔖 #${item.id}`, '');
  }
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
    return `${icon} #${row.id} · ${formatMoney(row.amount)}\n${row.category} · ${description}\n${row.local_created_at}`;
  });
  return [title, '', ...lines].join('\n\n');
}

async function getBudgetWarning(userId) {
  const { month, year } = getCurrentMonth(config.timezone);
  const rows = await getBudgetStatus({ userId, month, year, timezone: config.timezone });
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
}

async function handleCreateTransaction(ctx, type, command) {
  const { amountText, description } = parseTransactionInput(ctx.message.text, command);
  const amount = parseAmount(amountText);
  const categoryId = detectCategoryId(description, type);
  const user = await getUser(ctx.from.id);
  const sourceKey = `telegram:${ctx.chat.id}:${ctx.message.message_id}`;
  const saved = await createTransaction({ userId: ctx.from.id, type, amount, categoryId, description, source: 'command', sourceKey });
  if (!saved) return ctx.reply('✅ Tin nhắn này đã được xử lý trước đó.');
  let comment = funnyComment(type, categoryId, user?.personality);
  if (type === 'expense') {
    const stats = await getExpenseStats(ctx.from.id);
    if (stats.count >= 5 && stats.average > 0 && amount >= stats.average * 3) {
      comment += `${comment ? '\n' : ''}⚠️ Khoản này lớn hơn đáng kể so với mức chi trung bình 30 ngày.`;
    }
    const budgetWarning = await getBudgetWarning(ctx.from.id);
    if (budgetWarning) comment += `${comment ? '\n' : ''}${budgetWarning}`;
  }
  await sendSaved(ctx, saved, comment);
}

bot.start((ctx) => ctx.reply(['👋 Chào bạn! Tôi là Quản gia Tài chính AI.', '', helpMessage].join('\n')));
bot.help((ctx) => ctx.reply(helpMessage));
bot.command('id', (ctx) => ctx.reply(`Telegram User ID của bạn: ${ctx.from.id}`));
bot.command('chi', (ctx) => handleCreateTransaction(ctx, 'expense', 'chi'));
bot.command('thu', (ctx) => handleCreateTransaction(ctx, 'income', 'thu'));

bot.command('baocao', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'baocao');
  const { month, year } = parseMonth(input, config.timezone);
  const rows = await getMonthlySummary({ userId: ctx.from.id, month, year, timezone: config.timezone });
  if (!rows.length) return ctx.reply(`📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
  await ctx.reply(formatMonthlyReport(rows, month, year));
});

bot.command('bieudo', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'bieudo');
  const { month, year } = parseMonth(input, config.timezone);
  const rows = await getMonthlySummary({ userId: ctx.from.id, month, year, timezone: config.timezone });
  const url = createChartUrl(rows, month, year);
  if (!url) return ctx.reply(`📭 Chưa có khoản chi nào trong tháng ${month}/${year}.`);
  await ctx.replyWithPhoto(url, { caption: `📊 Biểu đồ chi tiêu tháng ${month}/${year}. Dữ liệu tổng hợp được gửi tới QuickChart để tạo ảnh.` });
});

bot.command('lichsu', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'lichsu');
  const limit = input ? parsePositiveInteger(input, 'Số giao dịch') : 10;
  if (limit > 20) throw new InputError('Chỉ có thể xem tối đa 20 giao dịch mỗi lần.');
  const rows = await getRecentTransactions({ userId: ctx.from.id, limit, timezone: config.timezone });
  if (!rows.length) return ctx.reply('📭 Bạn chưa có giao dịch nào.');
  await ctx.reply(formatRecentTransactions(rows, `🕘 ${rows.length} GIAO DỊCH GẦN NHẤT`));
});

bot.command('xoa', async (ctx) => {
  const transactionId = parsePositiveInteger(getCommandArguments(ctx.message.text, 'xoa'), 'Mã giao dịch');
  const deleted = await deleteTransaction({ userId: ctx.from.id, transactionId });
  await ctx.reply(deleted
    ? `🗑 Đã xóa giao dịch #${deleted.id}: ${formatMoney(deleted.amount)} — ${deleted.description}`
    : `❌ Không tìm thấy giao dịch #${transactionId}.`);
});

bot.command('export', async (ctx) => {
  const { month, year } = parseMonth(getCommandArguments(ctx.message.text, 'export'), config.timezone);
  const rows = await getMonthlyTransactions({ userId: ctx.from.id, month, year, timezone: config.timezone });
  if (!rows.length) return ctx.reply(`📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
  const filename = `thu-chi-${String(month).padStart(2, '0')}-${year}.csv`;
  await ctx.replyWithDocument({ source: Buffer.from(transactionsToCsv(rows), 'utf8'), filename }, { caption: `📄 Dữ liệu thu chi tháng ${month}/${year}` });
});

bot.command('ngansach', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'ngansach');
  const { month, year } = getCurrentMonth(config.timezone);
  if (!input) {
    const rows = await getBudgetStatus({ userId: ctx.from.id, month, year, timezone: config.timezone });
    return ctx.reply(formatBudgetStatus(rows, getCurrentDateParts(config.timezone)));
  }
  const parts = input.split(/\s+/);
  const categoryId = parts.length === 1 ? null : Number(parts[0]);
  const amount = parseAmount(parts.length === 1 ? parts[0] : parts[1]);
  if (categoryId !== null && ![1, 2, 3, 4, 5, 6, 7, 99].includes(categoryId)) {
    throw new InputError('Danh mục phải là 1–7 hoặc 99. Gõ /help để xem hướng dẫn.');
  }
  await upsertBudget({ userId: ctx.from.id, categoryId, amount, month, year });
  const label = categoryId === null ? 'tổng chi' : getCategoryName(categoryId);
  await ctx.reply(`🎯 Đã đặt ngân sách ${label} tháng ${month}/${year}: ${formatMoney(amount)}.`);
});

function parseDate(input) {
  if (!input) return null;
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new InputError('Ngày phải có dạng DD/MM/YYYY.');
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(match[3]) ||
    parsed.getUTCMonth() + 1 !== Number(match[2]) ||
    parsed.getUTCDate() !== Number(match[1])
  ) throw new InputError('Ngày không hợp lệ.');
  return iso;
}

bot.command('no', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'no');
  if (!input) {
    const rows = await getOpenDebts(ctx.from.id);
    if (!rows.length) return ctx.reply('🎉 Không có khoản nợ đang mở. Ví và tâm trí đều nhẹ!');
    return ctx.reply(['🤝 CÔNG NỢ ĐANG MỞ', '', ...rows.map((row) => {
      const label = Number(row.debt_type) === 1 ? `${row.person_name} nợ bạn` : `Bạn nợ ${row.person_name}`;
      return `#${row.id} · ${label}: ${formatMoney(row.remaining_amount)}${row.due_date ? `\nHạn: ${String(row.due_date).slice(0, 10)}` : ''}`;
    })].join('\n\n'));
  }
  const [main, description = '', dueText = ''] = input.split('|').map((part) => part.trim());
  const parts = main.split(/\s+/);
  const action = parts.shift()?.toLowerCase();
  if (action === 'tra') {
    const debtId = parsePositiveInteger(parts[0], 'Mã khoản nợ');
    const amount = parseAmount(parts[1]);
    const result = await payDebt({ userId: ctx.from.id, debtId, amount });
    if (!result) return ctx.reply(`❌ Không tìm thấy khoản nợ đang mở #${debtId}.`);
    return ctx.reply(`✅ Đã ghi trả ${formatMoney(result.payment)} cho khoản #${debtId}. Còn lại: ${formatMoney(result.remaining_amount)}.`);
  }
  if (!['cho', 'vay'].includes(action) || parts.length < 2) {
    throw new InputError('Ví dụ: /no cho Nam 200k | tiền Grab | 30/10/2026');
  }
  const amount = parseAmount(parts.pop());
  const personName = parts.join(' ').slice(0, 80);
  const debt = await createDebt({ userId: ctx.from.id, personName, debtType: action === 'cho' ? 1 : 2, amount, description: description.slice(0, 120), dueDate: parseDate(dueText) });
  await ctx.reply(`🤝 Đã tạo khoản #${debt.id}: ${action === 'cho' ? `${personName} nợ bạn` : `bạn nợ ${personName}`} ${formatMoney(amount)}.`);
});

bot.command('dinhky', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'dinhky');
  if (!input) {
    const rows = await getRecurring(ctx.from.id);
    if (!rows.length) return ctx.reply('📭 Chưa có giao dịch định kỳ.');
    return ctx.reply(['🔁 GIAO DỊCH ĐỊNH KỲ', '', ...rows.map((row) => `#${row.id} · ngày ${row.day_of_month} · ${row.transaction_type === 'expense' ? 'Chi' : 'Thu'} ${formatMoney(row.amount)} · ${row.description}`)].join('\n'));
  }
  const [main, dayText] = input.split('|').map((part) => part.trim());
  const parts = main.split(/\s+/);
  const action = parts.shift()?.toLowerCase();
  if (action === 'xoa') {
    const recurringId = parsePositiveInteger(parts[0], 'Mã định kỳ');
    const deleted = await deleteRecurring({ userId: ctx.from.id, recurringId });
    return ctx.reply(deleted ? `🗑 Đã xóa giao dịch định kỳ #${recurringId}.` : `❌ Không tìm thấy #${recurringId}.`);
  }
  if (action !== 'them' || parts.length < 3 || !dayText) throw new InputError('Ví dụ: /dinhky them chi 200k Internet | 5');
  const typeText = parts.shift().toLowerCase();
  const type = typeText === 'chi' ? 'expense' : typeText === 'thu' ? 'income' : null;
  if (!type) throw new InputError('Loại định kỳ phải là chi hoặc thu.');
  const amount = parseAmount(parts.shift());
  const description = parts.join(' ').slice(0, 120);
  const dayOfMonth = Number(dayText);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) throw new InputError('Ngày định kỳ phải từ 1 đến 31.');
  const saved = await createRecurring({ userId: ctx.from.id, type, amount, categoryId: detectCategoryId(description, type), description, dayOfMonth });
  await ctx.reply(`🔁 Đã tạo định kỳ #${saved.id}, nhắc vào ngày ${dayOfMonth} hằng tháng. Bot sẽ hỏi trước khi ghi.`);
});

bot.command('nhacnho', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'nhacnho').toLowerCase();
  if (!['on', 'off'].includes(input)) throw new InputError('Dùng /nhacnho on hoặc /nhacnho off.');
  await updatePreference(ctx.from.id, 'reminders_enabled', input === 'on');
  await ctx.reply(input === 'on' ? '🔔 Đã bật báo cáo tự động lúc 20:00.' : '🔕 Đã tắt báo cáo tự động.');
});

bot.command('phongcach', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'phongcach').toLowerCase();
  const values = { nhe: 'gentle', haihuoc: 'funny', thang: 'direct' };
  if (!values[input]) throw new InputError('Dùng /phongcach nhe, /phongcach haihuoc hoặc /phongcach thang.');
  await updatePreference(ctx.from.id, 'personality', values[input]);
  await ctx.reply('🎭 Đã đổi phong cách. Riêng sức khỏe, giáo dục và gia đình, tôi vẫn luôn tử tế.');
});

bot.command('ocr', async (ctx) => {
  const input = getCommandArguments(ctx.message.text, 'ocr').toLowerCase();
  if (!['on', 'off'].includes(input)) throw new InputError('Dùng /ocr on hoặc /ocr off.');
  await updatePreference(ctx.from.id, 'ocr_consent', input === 'on');
  await ctx.reply(input === 'on'
    ? '✅ Đã bật OCR. Ảnh gửi tới Gemini chỉ được xử lý trong RAM.'
    : '🔒 Đã tắt OCR. Bot sẽ không gửi ảnh tới Gemini.');
});

bot.command('aiquota', async (ctx) => {
  const usage = await getUsageStatus(ctx.from.id);
  await ctx.reply(`🤖 LƯỢT AI HÔM NAY\n\nText: ${usage.text}/${usage.textLimit}\nẢnh: ${usage.image}/${usage.imageLimit}\nCác lệnh /chi, /thu và báo cáo không dùng quota AI.`);
});

bot.command('quyenriengtu', (ctx) => ctx.reply([
  '🔐 QUYỀN RIÊNG TƯ', '',
  '• Dữ liệu mỗi Telegram user được tách riêng.',
  '• Câu tự nhiên và ảnh được gửi đến Gemini khi dùng AI.',
  '• Ảnh chỉ xử lý trong RAM, không lưu vào database.',
  '• Biểu đồ chỉ gửi số liệu tổng hợp đến QuickChart khi bạn gọi /bieudo.',
  '• Dùng /deletedata để xóa toàn bộ dữ liệu của bạn.',
].join('\n')));

bot.command('deletedata', (ctx) => ctx.reply('⚠️ Xóa vĩnh viễn toàn bộ giao dịch, ngân sách, công nợ và cài đặt của bạn?', Markup.inlineKeyboard([
  Markup.button.callback('🗑 Xóa tất cả', 'deleteall:confirm'),
  Markup.button.callback('Hủy', 'deleteall:cancel'),
])));

async function saveAiResult(ctx, result, source) {
  if (result.intent === 'HISTORY_REQ') {
    const limit = result.limit || 10;
    const rows = await getRecentTransactions({
      userId: ctx.from.id,
      limit,
      timezone: config.timezone,
    });
    if (!rows.length) return ctx.reply('📭 Bạn chưa có giao dịch nào.');
    return ctx.reply(
      formatRecentTransactions(rows, `🕘 ${rows.length} GIAO DỊCH GẦN NHẤT`),
    );
  }
  if (result.intent === 'REPORT_REQ') {
    const { month, year } = getCurrentMonth(config.timezone);
    const rows = await getMonthlySummary({ userId: ctx.from.id, month, year, timezone: config.timezone });
    return ctx.reply(rows.length ? formatMonthlyReport(rows, month, year) : `📭 Chưa có giao dịch nào trong tháng ${month}/${year}.`);
  }
  if (!result.items.length) return ctx.reply(result.reply || 'Tôi chưa tìm thấy giao dịch để ghi.');
  if (['EXPENSE', 'INCOME'].includes(result.intent)) {
    const mustConfirm = source === 'ocr' || result.needsConfirmation || result.confidence < 0.9 || result.items.some((item) => item.amount >= config.confirmationThreshold);
    if (mustConfirm) {
      const sourceKey = `telegram:${ctx.chat.id}:${ctx.message?.message_id || ctx.update.update_id}`;
      const token = createPending(ctx.from.id, { kind: 'transactions', items: result.items, source, sourceKey });
      const lines = ['🔎 Tôi hiểu như sau:', '', ...result.items.flatMap((item) => [...transactionLines(item), '']), result.reply].filter(Boolean);
      return ctx.reply(lines.join('\n'), Markup.inlineKeyboard([
        Markup.button.callback('✅ Lưu', `pending:save:${token}`),
        Markup.button.callback('✏️ Sửa', `pending:edit:${token}`),
        Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
      ]));
    }
    const sourceKey = `telegram:${ctx.chat.id}:${ctx.message?.message_id || ctx.update.update_id}`;
    const saved = await createTransactions({ userId: ctx.from.id, items: result.items, source, sourceKey });
    if (!saved.length) return ctx.reply('✅ Tin nhắn này đã được xử lý trước đó.');
    const warning = result.items.some((item) => item.type === 'expense') ? await getBudgetWarning(ctx.from.id) : '';
    return sendSaved(ctx, saved, [result.reply, warning].filter(Boolean).join('\n'));
  }
  if (result.intent === 'DEBT_ADD' && result.items[0]?.personName && result.items[0]?.debtType) {
    const item = result.items[0];
    const token = createPending(ctx.from.id, { kind: 'debt', item });
    return ctx.reply(`🤝 ${item.debtType === 1 ? `${item.personName} nợ bạn` : `Bạn nợ ${item.personName}`} ${formatMoney(item.amount)}. Lưu chứ?`, Markup.inlineKeyboard([
      Markup.button.callback('✅ Lưu', `pending:save:${token}`),
      Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
    ]));
  }
  if (result.intent === 'BUDGET_SET') {
    const item = result.items[0];
    const token = createPending(ctx.from.id, { kind: 'budget', item });
    const label = item.categoryId === 99 ? 'tổng chi' : getCategoryName(item.categoryId);
    return ctx.reply(`🎯 Đặt ngân sách ${label}: ${formatMoney(item.amount)} cho tháng này?`, Markup.inlineKeyboard([
      Markup.button.callback('✅ Lưu', `pending:save:${token}`),
      Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
    ]));
  }
  await ctx.reply(result.reply || (result.intent === 'REPORT_REQ' ? 'Dùng /baocao hoặc /bieudo nhé.' : 'Tôi chuyên quản tiền; chuyện này xin phép đứng ngoài sổ sách 😄'));
}

async function requestOcrConsent(ctx) {
  const user = await getUser(ctx.from.id);
  if (!user?.ocr_consent) {
    await ctx.reply('🔐 Ảnh sẽ được gửi tới Gemini để đọc và không được lưu lại. Bạn có đồng ý không? Sau khi đồng ý, hãy gửi lại ảnh.', Markup.inlineKeyboard([
      Markup.button.callback('✅ Đồng ý OCR', 'ocr:accept'),
      Markup.button.callback('Không', 'ocr:decline'),
    ]));
    return false;
  }
  return true;
}

async function handleOcrImage(ctx, { fileId, fileSize, declaredMime, filename }) {
  if (!(await requestOcrConsent(ctx))) return;
  if (fileSize && fileSize > config.ocrMaxImageMb * 1024 * 1024) {
    throw new InputError(
      `Ảnh quá lớn. Vui lòng gửi ảnh dưới ${config.ocrMaxImageMb} MB.`,
    );
  }
  await ctx.reply('🔎 Đang đọc ảnh…');
  const link = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(link, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Không tải được ảnh Telegram: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = resolveImageMime({
    declaredMime,
    responseMime: response.headers.get('content-type'),
    filename,
  });
  if (!mimeType) {
    throw new InputError('Bot chỉ hỗ trợ ảnh JPEG, PNG, WebP, HEIC hoặc HEIF.');
  }
  const result = await analyzeImage({ userId: ctx.from.id, imageBuffer: buffer, mimeType, timezone: config.timezone });
  await saveAiResult(ctx, result, 'ocr');
}

bot.on('photo', async (ctx) => {
  const photo = ctx.message.photo.at(-1);
  await handleOcrImage(ctx, {
    fileId: photo.file_id,
    fileSize: photo.file_size,
    declaredMime: 'image/jpeg',
    filename: 'telegram-photo.jpg',
  });
});

bot.on('document', async (ctx) => {
  const document = ctx.message.document;
  if (!looksLikeSupportedImage({
    mimeType: document.mime_type,
    filename: document.file_name,
  })) {
    await ctx.reply('❌ File này không phải ảnh được hỗ trợ. Hãy gửi JPEG, PNG, WebP, HEIC hoặc HEIF.');
    return;
  }
  await handleOcrImage(ctx, {
    fileId: document.file_id,
    fileSize: document.file_size,
    declaredMime: document.mime_type,
    filename: document.file_name,
  });
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  await ctx.sendChatAction('typing');
  try {
    const user = await getUser(ctx.from.id);
    const result = await analyzeText({ userId: ctx.from.id, text: ctx.message.text, timezone: config.timezone, personality: user?.personality });
    await saveAiResult(ctx, result, 'ai');
  } catch (error) {
    if (error instanceof InputError) throw error;
    console.error('AI text error:', error.message);
    await ctx.reply('🤖 AI đang bận một chút. Bạn vẫn có thể ghi nhanh bằng /chi 50k phở hoặc /thu 10tr lương.');
  }
});

bot.action(/^pending:(save|cancel|edit):(.+)$/, async (ctx) => {
  const [, action, token] = ctx.match;
  if (action === 'cancel') {
    cancelPending(token, ctx.from.id);
    await ctx.answerCbQuery('Đã hủy');
    return ctx.editMessageText('❌ Đã hủy, không lưu dữ liệu.');
  }
  if (action === 'edit') {
    cancelPending(token, ctx.from.id);
    await ctx.answerCbQuery('Hãy nhập lại');
    return ctx.editMessageText('✏️ Đã hủy bản nháp. Hãy gửi lại nội dung đã sửa, hoặc dùng /chi và /thu để nhập chính xác.');
  }
  const payload = consumePending(token, ctx.from.id);
  if (!payload) return ctx.answerCbQuery('Yêu cầu đã hết hạn hoặc đã được xử lý.', { show_alert: true });
  if (payload.kind === 'transactions') {
    const saved = await createTransactions({ userId: ctx.from.id, items: payload.items, source: payload.source, sourceKey: payload.sourceKey });
    await ctx.answerCbQuery('Đã lưu');
    if (!saved.length) return ctx.editMessageText('✅ Yêu cầu này đã được lưu trước đó.');
    return ctx.editMessageText(`✅ Đã lưu ${saved.length} giao dịch: ${saved.map((item) => `#${item.id}`).join(', ')}.`);
  }
  if (payload.kind === 'debt') {
    const item = payload.item;
    const saved = await createDebt({ userId: ctx.from.id, personName: item.personName, debtType: item.debtType, amount: item.amount, description: item.description });
    await ctx.answerCbQuery('Đã lưu');
    return ctx.editMessageText(`✅ Đã lưu khoản công nợ #${saved.id}.`);
  }
  if (payload.kind === 'budget') {
    const { month, year } = getCurrentMonth(config.timezone);
    const categoryId = payload.item.categoryId === 99 ? null : payload.item.categoryId;
    await upsertBudget({ userId: ctx.from.id, categoryId, amount: payload.item.amount, month, year });
    await ctx.answerCbQuery('Đã lưu');
    return ctx.editMessageText(`✅ Đã đặt ngân sách tháng ${month}/${year}: ${formatMoney(payload.item.amount)}.`);
  }
});

bot.action(/^undo:(\d+)$/, async (ctx) => {
  const deleted = await deleteTransaction({ userId: ctx.from.id, transactionId: Number(ctx.match[1]) });
  await ctx.answerCbQuery(deleted ? 'Đã hoàn tác' : 'Giao dịch không còn tồn tại');
  if (deleted) await ctx.editMessageText(`↩️ Đã hoàn tác giao dịch #${deleted.id}: ${formatMoney(deleted.amount)}.`);
});

bot.action(/^ocr:(accept|decline)$/, async (ctx) => {
  const accepted = ctx.match[1] === 'accept';
  await updatePreference(ctx.from.id, 'ocr_consent', accepted);
  await ctx.answerCbQuery();
  await ctx.editMessageText(accepted ? '✅ Đã bật OCR. Hãy gửi lại ảnh hóa đơn.' : '🔒 OCR vẫn đang tắt.');
});

bot.action(/^recurring:(post|skip):(\d+)$/, async (ctx) => {
  const [, action, id] = ctx.match;
  if (action === 'skip') {
    await ctx.answerCbQuery('Đã bỏ qua');
    return ctx.editMessageText('⏭ Đã bỏ qua kỳ này.');
  }
  const item = await getRecurringById({ userId: ctx.from.id, recurringId: Number(id) });
  if (!item) return ctx.answerCbQuery('Giao dịch định kỳ không còn tồn tại.', { show_alert: true });
  const promptedDate = item.last_prompted_on
    ? new Date(item.last_prompted_on).toISOString().slice(0, 10)
    : 'unknown';
  const saved = await createTransaction({ userId: ctx.from.id, type: item.transaction_type, amount: item.amount, categoryId: item.category_id, description: item.description, source: 'recurring', sourceKey: `recurring:${item.id}:${promptedDate}` });
  if (!saved) return ctx.answerCbQuery('Kỳ này đã được ghi trước đó.', { show_alert: true });
  await ctx.answerCbQuery('Đã ghi');
  await ctx.editMessageText(`✅ Đã ghi giao dịch định kỳ #${saved.id}: ${formatMoney(saved.amount)}.`);
});

bot.action(/^deleteall:(confirm|cancel)$/, async (ctx) => {
  if (ctx.match[1] === 'cancel') {
    await ctx.answerCbQuery('Đã hủy');
    return ctx.editMessageText('✅ Không có dữ liệu nào bị xóa.');
  }
  await deleteAllUserData(ctx.from.id);
  initializedUsers.delete(String(ctx.from.id));
  await ctx.answerCbQuery('Đã xóa');
  await ctx.editMessageText('🗑 Đã xóa toàn bộ dữ liệu tài chính và cài đặt của bạn. Hành động này không thể hoàn tác.');
});

bot.catch(async (error, ctx) => {
  if (error instanceof InputError) return ctx.reply(`❌ ${error.message}`);
  console.error('Telegram handler error:', error);
  try { await ctx.reply('❌ Đã có lỗi xảy ra. Vui lòng thử lại sau.'); } catch (replyError) { console.error('Không thể gửi thông báo lỗi:', replyError); }
});

module.exports = { bot, helpMessage, saveAiResult };
