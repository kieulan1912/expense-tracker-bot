const { Markup } = require('telegraf');
const { InputError } = require('../../../domain/errors');
const { formatMoney } = require('../../../utils/amount');
const { getCategoryName } = require('../../../utils/category');
const { getCurrentMonth, getCurrentDateParts } = require('../../../utils/month');
const { resolveImageMime, looksLikeSupportedImage } = require('../../../utils/image');
const {
  formatMonthlyReport,
  formatSpendingInsights,
} = require('../../../domain/services/report_service');
const {
  parseReportPeriod,
  parseSpendingInsight,
} = require('../../../domain/services/local_financial_query');
const { parseBankStatement } = require('../../../utils/bank_statement');
const { requireWritableLedger } = require('../context');
const {
  findDuplicates,
  duplicateText,
  suggestRecurring,
} = require('../transaction_automation');
const {
  debtCandidateKeyboard,
  requestDebtPaymentConfirmation,
  requestDebtCancellation,
  requestTransactionChange,
} = require('../action_flows');
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
    searchTransactions,
    getTransactionById,
    findRecentExpenseCandidates,
    getSpendingInsights,
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
  if (result.intent === 'SEARCH_REQ') {
    const rows = await searchTransactions({
      ledgerId: ctx.state.ledger.id,
      ...result.filters,
      limit: result.limit || 10,
      timezone: config.timezone,
    });
    if (!rows.length) return ctx.reply('📭 Không tìm thấy giao dịch phù hợp với các điều kiện đó.');
    return ctx.reply(formatRecentTransactions(rows, `🔎 TÌM THẤY ${rows.length} GIAO DỊCH`));
  }
  if (result.intent === 'SPENDING_INSIGHT') {
    const currentPeriod = getCurrentMonth(config.timezone);
    const month = result.reportPeriod?.month || currentPeriod.month;
    const year = result.reportPeriod?.year || currentPeriod.year;
    const scope = result.insightScope === 'child' ? 'child' : 'all';
    dependencies.conversationStore?.setReportPeriod(
      ctx.from.id,
      ctx.state.ledger.id,
      { month, year },
    );
    const insights = await getSpendingInsights({
      ledgerId: ctx.state.ledger.id,
      month,
      year,
      timezone: config.timezone,
      scope,
    });
    const verifiedSummary = formatSpendingInsights(insights);
    if (!insights.transactionCount) return ctx.reply(verifiedSummary);
    let narrative = '';
    try {
      const user = await dependencies.users.getUser(ctx.from.id);
      narrative = await dependencies.ai.explainSpendingInsights({
        userId: ctx.from.id,
        question: ctx.message?.text || '',
        insights,
        personality: user?.personality,
      });
    } catch (error) {
      console.error('AI spending insight error:', error.message);
    }
    return ctx.reply([
      verifiedSummary,
      narrative ? `\n💡 NHẬN ĐỊNH\n${narrative}` : '',
    ].filter(Boolean).join('\n'));
  }
  if (result.intent === 'REPORT_REQ') {
    const currentPeriod = getCurrentMonth(config.timezone);
    const month = result.reportPeriod?.month || currentPeriod.month;
    const year = result.reportPeriod?.year || currentPeriod.year;
    dependencies.conversationStore?.setReportPeriod(
      ctx.from.id,
      ctx.state.ledger.id,
      { month, year },
    );
    const reportParams = {
      ledgerId: ctx.state.ledger.id, month, year, timezone: config.timezone,
    };
    const [rows, budgetRows] = await Promise.all([
      getMonthlySummary(reportParams),
      finance.getBudgetStatus(reportParams),
    ]);
    const asOfDateParts = getCurrentDateParts(config.timezone);
    const reportRows = rows.filter((row) =>
      (!result.reportPeriod?.transactionType
        || row.transaction_type === result.reportPeriod.transactionType)
      && (result.reportPeriod?.categoryId === null
        || result.reportPeriod?.categoryId === undefined
        || Number(row.category_id) === result.reportPeriod.categoryId));
    if (!reportRows.length) {
      return ctx.reply(`📭 Không có giao dịch phù hợp trong tháng ${month}/${year}.`);
    }
    const isFilteredReport = Boolean(
      result.reportPeriod?.transactionType || result.reportPeriod?.categoryId,
    );
    const scopeLabel = [
      result.reportPeriod?.transactionType === 'expense' ? 'khoản chi' : '',
      result.reportPeriod?.transactionType === 'income' ? 'khoản thu' : '',
      result.reportPeriod?.categoryId
        ? getCategoryName(result.reportPeriod.categoryId, result.reportPeriod.transactionType || 'expense')
        : '',
    ].filter(Boolean).join(' · ');
    return ctx.reply(
      formatMonthlyReport(
        reportRows,
        month,
        year,
        ctx.state.ledger.name,
        isFilteredReport ? [] : budgetRows,
        asOfDateParts,
        scopeLabel,
      ),
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
      || result.items.length > 1
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
    const duplicates = await findDuplicates(transactions, ledger.id, result.items);
    if (duplicates.length) {
      const token = createPending(ctx.from.id, {
        kind: 'transactions', ledgerId: ledger.id, items: result.items,
        source, sourceKey, duplicateConfirmed: true,
      });
      return ctx.reply(duplicateText(duplicates), Markup.inlineKeyboard([
        Markup.button.callback('✅ Vẫn lưu', `pending:save:${token}`),
        Markup.button.callback('❌ Không lưu', `pending:cancel:${token}`),
      ]));
    }
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
    await sendSaved(ctx, saved, [result.reply, warning].filter(Boolean).join('\n'), ledger);
    return suggestRecurring(ctx, transactions, saved, ledger.id);
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
  if (['DEBT_PAY', 'DEBT_CANCEL'].includes(result.intent)) {
    const ledger = requireWritableLedger(ctx);
    const item = result.items[0];
    let candidates = item.targetId
      ? [await finance.getDebtById({ ledgerId: ledger.id, debtId: item.targetId })]
        .filter((debt) => debt?.status === 'open')
      : await finance.findOpenDebts({
        ledgerId: ledger.id,
        personName: item.personName || '',
      });
    if (result.intent === 'DEBT_CANCEL' && ledger.role !== 'owner') {
      candidates = candidates.filter(
        (debt) => String(debt.created_by_user_id) === String(ctx.from.id),
      );
    }
    if (!candidates.length) {
      return ctx.reply('❌ Tôi không tìm thấy khoản công nợ đang mở phù hợp. Gõ /no để xem danh sách.');
    }
    if (candidates.length > 1) {
      if (result.intent === 'DEBT_CANCEL') {
        return ctx.reply(
          'Tìm thấy nhiều khoản phù hợp. Hãy chọn đúng khoản cần hủy:',
          Markup.inlineKeyboard(candidates.slice(0, 8).map((debt) => [
            Markup.button.callback(
              `🚫 #${debt.id} · ${debt.person_name} · ${formatMoney(debt.remaining_amount)}`,
              `debt:cancel:${debt.id}`,
            ),
          ])),
        );
      }
      return ctx.reply(
        'Tìm thấy nhiều khoản phù hợp. Hãy chọn đúng khoản đã thanh toán:',
        debtCandidateKeyboard(
          candidates,
          item.settleFull ? 'full' : 'partial',
          item.amount,
        ),
      );
    }
    if (result.intent === 'DEBT_CANCEL') {
      return requestDebtCancellation(ctx, { debt: candidates[0], createPending });
    }
    return requestDebtPaymentConfirmation(ctx, {
      debt: candidates[0],
      amount: item.settleFull ? Number(candidates[0].remaining_amount) : item.amount,
      createPending,
    });
  }
  if (['TRANSACTION_CANCEL', 'TRANSACTION_ADJUST'].includes(result.intent)) {
    const ledger = requireWritableLedger(ctx);
    const item = result.items[0];
    let candidates = item.targetId
      ? [await getTransactionById({ ledgerId: ledger.id, transactionId: item.targetId })]
        .filter(Boolean)
      : await findRecentExpenseCandidates({
        ledgerId: ledger.id,
        personName: item.personName || '',
        amount: item.adjustmentAmount || item.amount || null,
        limit: 8,
      });
    if (ledger.role !== 'owner') {
      candidates = candidates.filter(
        (transaction) => String(transaction.created_by_user_id) === String(ctx.from.id),
      );
    }
    if (!candidates.length) {
      return ctx.reply('❌ Tôi không tìm thấy khoản chi phù hợp trong 90 ngày gần đây. Dùng /lichsu để kiểm tra ID.');
    }
    const reduction = item.adjustmentAmount || item.amount;
    const action = result.intent === 'TRANSACTION_CANCEL' ? 'cancel' : 'adjust';
    if (candidates.length > 1) {
      return ctx.reply(
        'Tìm thấy nhiều khoản phù hợp. Hãy chọn đúng giao dịch:',
        Markup.inlineKeyboard(candidates.map((transaction) => [
          Markup.button.callback(
            `#${transaction.id} · ${formatMoney(transaction.amount)} · ${transaction.description.slice(0, 25)}`,
            `tx:aichoose:${action}:${transaction.id}:${reduction || 0}`,
          ),
        ])),
      );
    }
    const transaction = candidates[0];
    const isPartialCancellation = action === 'cancel'
      && Number(reduction) > 0
      && Number(transaction.amount) > Number(reduction);
    const newAmount = action === 'cancel' && !isPartialCancellation
      ? null
      : Number(transaction.amount) - Number(reduction);
    return requestTransactionChange(ctx, {
      transaction,
      newAmount: newAmount > 0 ? newAmount : null,
      newDescription: newAmount > 0 ? item.description : null,
      reason: result.reply || 'Điều chỉnh theo yêu cầu bằng AI',
      createPending,
    });
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

async function downloadTelegramFile(ctx, fileId, timeout = 20_000) {
  const link = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(link, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Không tải được file Telegram: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function handleBankStatement(ctx, document, dependencies) {
  const { pendingStore } = dependencies;
  const ledger = requireWritableLedger(ctx);
  if (document.file_size && document.file_size > 5 * 1024 * 1024) {
    throw new InputError('Sao kê quá lớn. Vui lòng gửi file dưới 5 MB.');
  }
  await ctx.reply('📄 Đang đọc sao kê cục bộ…');
  const buffer = await downloadTelegramFile(ctx, document.file_id);
  const items = parseBankStatement(buffer, document.file_name);
  const totalIncome = items.filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = items.filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0);
  const token = pendingStore.createPending(ctx.from.id, {
    kind: 'transactions', ledgerId: ledger.id, items, source: 'bank_import',
    sourceKey: `telegram:bank:${ctx.chat.id}:${document.file_unique_id || ctx.message.message_id}`,
  });
  const preview = items.slice(0, 8).map((item, index) =>
    `${index + 1}. ${item.type === 'expense' ? '📤' : '📥'} ${formatMoney(item.amount)} · ${getCategoryName(item.categoryId, item.type)}\n   ${item.description}`);
  return ctx.reply([
    `🔎 Đã nhận diện ${items.length} giao dịch`,
    `Tổng thu: ${formatMoney(totalIncome)} · Tổng chi: ${formatMoney(totalExpense)}`,
    '', ...preview,
    ...(items.length > preview.length ? [`… và ${items.length - preview.length} dòng khác`] : []),
    '', 'Kiểm tra preview rồi xác nhận lưu vào sổ.',
  ].join('\n'), Markup.inlineKeyboard([
    Markup.button.callback(`✅ Lưu ${items.length} dòng`, `pending:save:${token}`),
    Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
  ]));
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
    conversationStore,
    getBudgetWarning,
    handleLedgerTextInput,
    handleFinanceTextInput,
  } = dependencies;
  const {
    createTransaction,
    createTransactions,
    getTransactionById,
    adjustTransaction,
    deleteTransaction,
  } = transactions;
  const {
    upsertBudget,
    createDebt,
    payDebt,
    cancelDebt,
    getRecurringById,
  } = finance;
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
    if (/\.(?:csv|xlsx)$/i.test(document.file_name || '')) {
      await handleBankStatement(ctx, document, dependencies);
      return;
    }
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
    if (await handleFinanceTextInput(ctx)) return;
    await ctx.sendChatAction('typing');
    try {
      const user = await getUser(ctx.from.id);
      const conversationContext = {
        lastReportPeriod: conversationStore?.getReportPeriod(
          ctx.from.id,
          ctx.state.ledger.id,
        ) || null,
      };
      const result = parseSpendingInsight(
        ctx.message.text,
        config.timezone,
        conversationContext.lastReportPeriod,
      ) || parseReportPeriod(
        ctx.message.text,
        config.timezone,
        conversationContext.lastReportPeriod,
      ) || await ai.analyzeText({
          userId: ctx.from.id,
          text: ctx.message.text,
          timezone: config.timezone,
          personality: user?.personality,
          conversationContext,
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
      if (!payload.duplicateConfirmed) {
        const duplicates = await findDuplicates(transactions, access.id, payload.items);
        if (duplicates.length) {
          const nextToken = createPending(ctx.from.id, {
            ...payload,
            duplicateConfirmed: true,
          });
          await ctx.answerCbQuery('Phát hiện khoản có thể bị trùng');
          return ctx.editMessageText(duplicateText(duplicates), Markup.inlineKeyboard([
            Markup.button.callback('✅ Vẫn lưu', `pending:save:${nextToken}`),
            Markup.button.callback('❌ Không lưu', `pending:cancel:${nextToken}`),
          ]));
        }
      }
      const saved = await createTransactions({
        userId: ctx.from.id,
        ledgerId: access.id,
        items: payload.items,
        source: payload.source,
        sourceKey: payload.sourceKey,
      });
      await ctx.answerCbQuery('Đã lưu');
      if (!saved.length) return ctx.editMessageText('✅ Yêu cầu này đã được lưu trước đó.');
      const warning = getBudgetWarning && payload.items.some((item) => item.type === 'expense')
        ? await getBudgetWarning(access.id)
        : '';
      await ctx.editMessageText([
        `✅ Đã lưu ${saved.length} giao dịch: ${saved.map((item) => `#${item.id}`).join(', ')}.`,
        warning,
      ].filter(Boolean).join('\n\n'));
      return suggestRecurring(ctx, transactions, saved, access.id);
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
    if (payload.kind === 'debt_payment') {
      const result = await payDebt({
        userId: ctx.from.id,
        ledgerId: access.id,
        debtId: payload.debtId,
        amount: payload.amount,
        sourceKey: payload.sourceKey,
      });
      if (!result) {
        return ctx.answerCbQuery('Khoản công nợ không còn mở.', { show_alert: true });
      }
      if (result.error === 'overpayment') {
        return ctx.answerCbQuery(
          `Chỉ còn ${formatMoney(result.remainingAmount)}. Hãy tạo lại thao tác.`,
          { show_alert: true },
        );
      }
      if (result.error === 'duplicate') {
        return ctx.answerCbQuery('Thanh toán này đã được ghi trước đó.', { show_alert: true });
      }
      await ctx.answerCbQuery('Đã cập nhật công nợ');
      return ctx.editMessageText(
        `✅ Đã ghi thanh toán ${formatMoney(result.payment)} cho khoản #${result.id}.\nCòn lại: ${formatMoney(result.remaining_amount)}.`,
      );
    }
    if (payload.kind === 'debt_cancel') {
      const cancelled = await cancelDebt({
        userId: ctx.from.id,
        ledgerId: access.id,
        debtId: payload.debtId,
        reason: payload.reason,
      });
      if (!cancelled) {
        return ctx.answerCbQuery('Không thể hủy: khoản không còn mở hoặc bạn không có quyền.', { show_alert: true });
      }
      await ctx.answerCbQuery('Đã hủy công nợ');
      return ctx.editMessageText(`🚫 Đã hủy khoản công nợ #${cancelled.id}.`);
    }
    if (['transaction_cancel', 'transaction_adjust'].includes(payload.kind)) {
      const changed = await adjustTransaction({
        userId: ctx.from.id,
        ledgerId: access.id,
        transactionId: payload.transactionId,
        newAmount: payload.kind === 'transaction_cancel' ? null : payload.newAmount,
        newDescription: payload.newDescription,
        reason: payload.reason,
      });
      if (!changed || changed.error) {
        return ctx.answerCbQuery('Không thể cập nhật giao dịch hoặc bạn không có quyền.', { show_alert: true });
      }
      await ctx.answerCbQuery('Đã cập nhật');
      return ctx.editMessageText(changed.action === 'cancel'
        ? `🚫 Đã hủy giao dịch #${changed.id}. Báo cáo sẽ không còn tính khoản này.`
        : `✅ Đã điều chỉnh #${changed.id}: ${formatMoney(changed.amount_before)} → ${formatMoney(changed.amount)}.`);
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
  bot.action(/^tx:aichoose:(cancel|adjust):(\d+):(\d+)$/, async (ctx) => {
    const ledger = requireWritableLedger(ctx);
    const [, action, transactionIdText, reductionText] = ctx.match;
    const transaction = await getTransactionById({
      ledgerId: ledger.id,
      transactionId: Number(transactionIdText),
    });
    if (!transaction) {
      return ctx.answerCbQuery('Giao dịch không còn tồn tại.', { show_alert: true });
    }
    if (ledger.role !== 'owner'
      && String(transaction.created_by_user_id) !== String(ctx.from.id)) {
      return ctx.answerCbQuery('Bạn chỉ có thể sửa giao dịch do mình tạo.', { show_alert: true });
    }
    await ctx.answerCbQuery();
    const reduction = Number(reductionText);
    const isPartialCancellation = action === 'cancel'
      && reduction > 0
      && Number(transaction.amount) > reduction;
    const newAmount = action === 'cancel' && !isPartialCancellation
      ? null
      : Number(transaction.amount) - reduction;
    return requestTransactionChange(ctx, {
      transaction,
      newAmount: newAmount > 0 ? newAmount : null,
      reason: 'Điều chỉnh theo yêu cầu bằng AI',
      createPending,
    });
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
  bot.action(/^recurring:(suggest|dismiss):(\d+)$/, async (ctx) => {
    const [, action, transactionIdText] = ctx.match;
    if (action === 'dismiss') {
      await ctx.answerCbQuery('Đã bỏ qua');
      return ctx.editMessageText('⏭ Đã bỏ qua gợi ý định kỳ.');
    }
    const ledger = requireWritableLedger(ctx);
    const transaction = await getTransactionById({
      ledgerId: ledger.id,
      transactionId: Number(transactionIdText),
    });
    if (!transaction) return ctx.answerCbQuery('Giao dịch không còn tồn tại.', { show_alert: true });
    const candidate = await transactions.detectRecurringCandidate({
      ledgerId: ledger.id,
      transactionId: transaction.id,
    });
    if (!candidate) return ctx.answerCbQuery('Định kỳ này đã tồn tại hoặc mẫu không còn phù hợp.', { show_alert: true });
    const recurring = await finance.createRecurring({
      userId: ctx.from.id,
      ledgerId: ledger.id,
      type: candidate.type,
      amount: candidate.amount,
      categoryId: candidate.categoryId,
      description: candidate.description,
      dayOfMonth: candidate.dayOfMonth,
    });
    await ctx.answerCbQuery('Đã tạo định kỳ');
    return ctx.editMessageText(`✅ Đã tạo định kỳ #${recurring.id}, nhắc khoảng ngày ${candidate.dayOfMonth} hằng tháng.`);
  });
}

module.exports = { registerAiHandlers, saveAiResult };
