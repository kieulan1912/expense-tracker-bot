const { Markup } = require('telegraf');
const { InputError } = require('../../../domain/errors');
const { formatMoney } = require('../../../utils/amount');
const { getCategoryName } = require('../../../utils/category');
const { getCurrentMonth } = require('../../../utils/month');
const { resolveImageMime, looksLikeSupportedImage } = require('../../../utils/image');
const { formatMonthlyReport } = require('../../../domain/services/report_service');
const { requireWritableLedger } = require('../context');
const {
  transactionLines,
  sendSaved,
  formatRecentTransactions,
  monthlyReportKeyboard,
} = require('../views');

async function saveAiResult(ctx, result, source, dependencies) {
  const {
    config,
    transactions,
    finance,
    pendingStore,
    getBudgetWarning,
  } = dependencies;
  const {
    createTransactions,
    getMonthlySummary,
    getRecentTransactions,
  } = transactions;
  const { createPending } = pendingStore;
  if (result.intent === 'HISTORY_REQ') {
    const limit = result.limit || 10;
    const rows = await getRecentTransactions({
      ledgerId: ctx.state.ledger.id,
      limit,
      timezone: config.timezone,
    });
    if (!rows.length) return ctx.reply('📭 Bạn chưa có giao dịch nào.');
    return ctx.reply(formatRecentTransactions(rows, `🕘 ${rows.length} GIAO DỊCH GẦN NHẤT`));
  }
  if (result.intent === 'REPORT_REQ') {
    const { month, year } = getCurrentMonth(config.timezone);
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
  }
  if (!result.items.length) {
    return ctx.reply(result.reply || 'Tôi chưa tìm thấy giao dịch để ghi.');
  }
  if (['EXPENSE', 'INCOME'].includes(result.intent)) {
    const ledger = requireWritableLedger(ctx);
    const mustConfirm = source === 'ocr'
      || result.needsConfirmation
      || result.confidence < 0.9
      || result.items.some((item) => item.amount >= config.confirmationThreshold);
    if (mustConfirm) {
      const sourceKey = `telegram:${ctx.chat.id}:${ctx.message?.message_id || ctx.update.update_id}`;
      const token = createPending(ctx.from.id, {
        kind: 'transactions',
        ledgerId: ledger.id,
        items: result.items,
        source,
        sourceKey,
      });
      const lines = [
        '🔎 Tôi hiểu như sau:', '',
        ...result.items.flatMap((item) => [...transactionLines(item), '']),
        result.reply,
      ].filter(Boolean);
      return ctx.reply(lines.join('\n'), Markup.inlineKeyboard([
        Markup.button.callback('✅ Lưu', `pending:save:${token}`),
        Markup.button.callback('✏️ Sửa', `pending:edit:${token}`),
        Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
      ]));
    }
    const sourceKey = `telegram:${ctx.chat.id}:${ctx.message?.message_id || ctx.update.update_id}`;
    const saved = await createTransactions({
      userId: ctx.from.id,
      ledgerId: ledger.id,
      items: result.items,
      source,
      sourceKey,
    });
    if (!saved.length) return ctx.reply('✅ Tin nhắn này đã được xử lý trước đó.');
    const warning = result.items.some((item) => item.type === 'expense')
      ? await getBudgetWarning(ledger.id)
      : '';
    return sendSaved(ctx, saved, [result.reply, warning].filter(Boolean).join('\n'), ledger);
  }
  if (result.intent === 'DEBT_ADD' && result.items[0]?.personName && result.items[0]?.debtType) {
    const ledger = requireWritableLedger(ctx);
    const item = result.items[0];
    const token = createPending(ctx.from.id, {
      kind: 'debt',
      ledgerId: ledger.id,
      item,
    });
    return ctx.reply(
      `🤝 ${item.debtType === 1 ? `${item.personName} nợ bạn` : `Bạn nợ ${item.personName}`} ${formatMoney(item.amount)}. Lưu chứ?`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Lưu', `pending:save:${token}`),
        Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
      ]),
    );
  }
  if (result.intent === 'BUDGET_SET') {
    const ledger = requireWritableLedger(ctx);
    const item = result.items[0];
    const token = createPending(ctx.from.id, {
      kind: 'budget',
      ledgerId: ledger.id,
      item,
    });
    const label = item.categoryId === 99 ? 'tổng chi' : getCategoryName(item.categoryId);
    return ctx.reply(
      `🎯 Đặt ngân sách ${label}: ${formatMoney(item.amount)} cho tháng này?`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Lưu', `pending:save:${token}`),
        Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
      ]),
    );
  }
  return ctx.reply(
    result.reply
      || 'Tôi chuyên quản tiền; chuyện này xin phép đứng ngoài sổ sách 😄',
  );
}

async function requestOcrConsent(ctx, users) {
  const user = await users.getUser(ctx.from.id);
  if (!user?.ocr_consent) {
    await ctx.reply(
      '🔐 Ảnh sẽ được gửi tới Gemini để đọc và không được lưu lại. Bạn có đồng ý không? Sau khi đồng ý, hãy gửi lại ảnh.',
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Đồng ý OCR', 'ocr:accept'),
        Markup.button.callback('Không', 'ocr:decline'),
      ]),
    );
    return false;
  }
  return true;
}

async function handleOcrImage(
  ctx,
  { fileId, fileSize, declaredMime, filename },
  dependencies,
) {
  const { config, users, ai } = dependencies;
  requireWritableLedger(ctx);
  if (!(await requestOcrConsent(ctx, users))) return;
  if (fileSize && fileSize > config.ocrMaxImageMb * 1024 * 1024) {
    throw new InputError(`Ảnh quá lớn. Vui lòng gửi ảnh dưới ${config.ocrMaxImageMb} MB.`);
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
  const result = await ai.analyzeImage({
    userId: ctx.from.id,
    imageBuffer: buffer,
    mimeType,
    timezone: config.timezone,
  });
  return saveAiResult(ctx, result, 'ocr', dependencies);
}

function registerAiHandlers(bot, dependencies) {
  const {
    config,
    transactions,
    finance,
    ledgers,
    users,
    ai,
    pendingStore,
    handleLedgerTextInput,
  } = dependencies;
  const {
    createTransaction,
    createTransactions,
    deleteTransaction,
  } = transactions;
  const { upsertBudget, createDebt, getRecurringById } = finance;
  const { getLedgerAccess } = ledgers;
  const { getUser, updatePreference } = users;
  const { createPending, consumePending, cancelPending } = pendingStore;

  bot.on('photo', async (ctx) => {
    const photo = ctx.message.photo.at(-1);
    await handleOcrImage(ctx, {
      fileId: photo.file_id,
      fileSize: photo.file_size,
      declaredMime: 'image/jpeg',
      filename: 'telegram-photo.jpg',
    }, dependencies);
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
    }, dependencies);
  });
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    if (await handleLedgerTextInput(ctx)) return;
    await ctx.sendChatAction('typing');
    try {
      const user = await getUser(ctx.from.id);
      const result = await ai.analyzeText({
        userId: ctx.from.id,
        text: ctx.message.text,
        timezone: config.timezone,
        personality: user?.personality,
      });
      await saveAiResult(ctx, result, 'ai', dependencies);
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
    if (!payload) {
      return ctx.answerCbQuery('Yêu cầu đã hết hạn hoặc đã được xử lý.', { show_alert: true });
    }
    const access = payload.ledgerId
      ? await getLedgerAccess(ctx.from.id, payload.ledgerId)
      : ctx.state.ledger;
    if (!access || access.role === 'viewer') {
      return ctx.answerCbQuery('Bạn không còn quyền ghi vào sổ này.', { show_alert: true });
    }
    if (payload.kind === 'transactions') {
      const saved = await createTransactions({
        userId: ctx.from.id,
        ledgerId: access.id,
        items: payload.items,
        source: payload.source,
        sourceKey: payload.sourceKey,
      });
      await ctx.answerCbQuery('Đã lưu');
      if (!saved.length) return ctx.editMessageText('✅ Yêu cầu này đã được lưu trước đó.');
      return ctx.editMessageText(`✅ Đã lưu ${saved.length} giao dịch: ${saved.map((item) => `#${item.id}`).join(', ')}.`);
    }
    if (payload.kind === 'debt') {
      const item = payload.item;
      const saved = await createDebt({
        userId: ctx.from.id,
        ledgerId: access.id,
        personName: item.personName,
        debtType: item.debtType,
        amount: item.amount,
        description: item.description,
      });
      await ctx.answerCbQuery('Đã lưu');
      return ctx.editMessageText(`✅ Đã lưu khoản công nợ #${saved.id}.`);
    }
    if (payload.kind === 'budget') {
      const { month, year } = getCurrentMonth(config.timezone);
      const categoryId = payload.item.categoryId === 99 ? null : payload.item.categoryId;
      await upsertBudget({
        userId: ctx.from.id,
        ledgerId: access.id,
        categoryId,
        amount: payload.item.amount,
        month,
        year,
      });
      await ctx.answerCbQuery('Đã lưu');
      return ctx.editMessageText(`✅ Đã đặt ngân sách tháng ${month}/${year}: ${formatMoney(payload.item.amount)}.`);
    }
    return ctx.answerCbQuery('Loại yêu cầu không được hỗ trợ.', { show_alert: true });
  });
  bot.action(/^undo:(\d+)$/, async (ctx) => {
    requireWritableLedger(ctx);
    const deleted = await deleteTransaction({
      userId: ctx.from.id,
      ledgerId: ctx.state.ledger.id,
      transactionId: Number(ctx.match[1]),
    });
    await ctx.answerCbQuery(deleted ? 'Đã hoàn tác' : 'Giao dịch không còn tồn tại');
    if (deleted) {
      await ctx.editMessageText(`↩️ Đã hoàn tác giao dịch #${deleted.id}: ${formatMoney(deleted.amount)}.`);
    }
  });
  bot.action(/^ocr:(accept|decline)$/, async (ctx) => {
    const accepted = ctx.match[1] === 'accept';
    await updatePreference(ctx.from.id, 'ocr_consent', accepted);
    await ctx.answerCbQuery();
    return ctx.editMessageText(accepted
      ? '✅ Đã bật OCR. Hãy gửi lại ảnh hóa đơn.'
      : '🔒 OCR vẫn đang tắt.');
  });
  bot.action(/^recurring:(post|skip):(\d+)$/, async (ctx) => {
    const [, action, id] = ctx.match;
    if (action === 'skip') {
      await ctx.answerCbQuery('Đã bỏ qua');
      return ctx.editMessageText('⏭ Đã bỏ qua kỳ này.');
    }
    const item = await getRecurringById({
      userId: ctx.from.id,
      recurringId: Number(id),
    });
    if (!item) {
      return ctx.answerCbQuery('Giao dịch định kỳ không còn tồn tại.', { show_alert: true });
    }
    const promptedDate = item.last_prompted_on
      ? new Date(item.last_prompted_on).toISOString().slice(0, 10)
      : 'unknown';
    const saved = await createTransaction({
      userId: ctx.from.id,
      ledgerId: item.ledger_id,
      type: item.transaction_type,
      amount: item.amount,
      categoryId: item.category_id,
      description: item.description,
      source: 'recurring',
      sourceKey: `recurring:${item.id}:${promptedDate}`,
    });
    if (!saved) return ctx.answerCbQuery('Kỳ này đã được ghi trước đó.', { show_alert: true });
    await ctx.answerCbQuery('Đã ghi');
    return ctx.editMessageText(`✅ Đã ghi giao dịch định kỳ #${saved.id}: ${formatMoney(saved.amount)}.`);
  });
}

module.exports = { registerAiHandlers, saveAiResult };
