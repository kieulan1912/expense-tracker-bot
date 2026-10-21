const { Markup } = require('telegraf');
const { InputError } = require('../../domain/errors');
const { formatMoney } = require('../../utils/amount');

function debtDirection(debt) {
  return Number(debt.debt_type) === 1
    ? `${debt.person_name} nợ bạn`
    : `Bạn nợ ${debt.person_name}`;
}

function debtListView(rows, { userId = null, role = 'viewer', page = 0 } = {}) {
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
  const shown = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const lines = [
    '🤝 CÔNG NỢ ĐANG MỞ',
    ...(totalPages > 1 ? [`Trang ${safePage + 1}/${totalPages}`] : []),
    '',
  ];
  for (const debt of shown) {
    lines.push(
      `#${debt.id} · ${Number(debt.debt_type) === 1 ? 'PHẢI THU' : 'PHẢI TRẢ'}`,
      `${debtDirection(debt)}: ${formatMoney(debt.remaining_amount)}`,
      ...(debt.description ? [`Lý do: ${debt.description}`] : []),
      ...(debt.due_date ? [`Hạn: ${String(debt.due_date).slice(0, 10)}`] : []),
      '',
    );
  }
  const buttons = shown.flatMap((debt) => {
    if (role === 'viewer') {
      return [[Markup.button.callback(`ℹ️ Chi tiết #${debt.id}`, `debt:details:${debt.id}`)]];
    }
    const rowsForDebt = [[
      Markup.button.callback(`💸 Trả #${debt.id}`, `debt:partial:${debt.id}`),
      Markup.button.callback(`✅ Tất toán #${debt.id}`, `debt:full:${debt.id}`),
      Markup.button.callback('ℹ️', `debt:details:${debt.id}`),
    ]];
    if (role === 'owner' || String(debt.created_by_user_id) === String(userId)) {
      rowsForDebt.push([
        Markup.button.callback(`🚫 Hủy khoản #${debt.id}`, `debt:cancel:${debt.id}`),
      ]);
    }
    return rowsForDebt;
  });
  if (totalPages > 1) {
    buttons.push([
      ...(safePage > 0
        ? [Markup.button.callback('⬅️ Trước', `debt:list:${safePage - 1}`)]
        : []),
      ...(safePage < totalPages - 1
        ? [Markup.button.callback('Sau ➡️', `debt:list:${safePage + 1}`)]
        : []),
    ]);
  }
  return { text: lines.join('\n').trim(), keyboard: Markup.inlineKeyboard(buttons) };
}

function debtCandidateKeyboard(rows, action, amount = null) {
  return Markup.inlineKeyboard(rows.slice(0, 8).map((debt) => [
    Markup.button.callback(
      `#${debt.id} · ${debt.person_name} · ${formatMoney(debt.remaining_amount)}`,
      `debt:choose:${action}:${debt.id}:${amount || 0}`,
    ),
  ]));
}

async function requestDebtPaymentConfirmation(ctx, {
  debt,
  amount,
  createPending,
}) {
  const remaining = Number(debt.remaining_amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new InputError('Số tiền thanh toán không hợp lệ.');
  }
  if (amount > remaining) {
    throw new InputError(
      `Khoản #${debt.id} chỉ còn ${formatMoney(remaining)}. Hãy nhập đúng số còn lại hoặc chọn Tất toán.`,
    );
  }
  const token = createPending(ctx.from.id, {
    kind: 'debt_payment',
    ledgerId: debt.ledger_id,
    debtId: Number(debt.id),
    amount,
    sourceKey: `telegram:debt:${ctx.chat.id}:${ctx.update.update_id}`,
  });
  const after = remaining - amount;
  return ctx.reply([
    '🔎 XÁC NHẬN THANH TOÁN', '',
    `Khoản #${debt.id} · ${debtDirection(debt)}`,
    `Thanh toán: ${formatMoney(amount)}`,
    `Trước đó: ${formatMoney(remaining)}`,
    `Còn lại: ${formatMoney(after)}`,
    '',
    'Khoản trả nợ này không được tính là thu nhập hoặc chi tiêu.',
  ].join('\n'), Markup.inlineKeyboard([
    Markup.button.callback('✅ Xác nhận', `pending:save:${token}`),
    Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
  ]));
}

async function requestDebtCancellation(ctx, { debt, createPending }) {
  const token = createPending(ctx.from.id, {
    kind: 'debt_cancel',
    ledgerId: debt.ledger_id,
    debtId: Number(debt.id),
    reason: 'Hủy khoản công nợ theo yêu cầu người dùng',
  });
  return ctx.reply([
    '⚠️ XÁC NHẬN HỦY CÔNG NỢ', '',
    `#${debt.id} · ${debtDirection(debt)}`,
    `Còn lại: ${formatMoney(debt.remaining_amount)}`,
    '',
    'Hủy chỉ dùng khi khoản này được nhập sai hoặc không còn hiệu lực; đây không phải thao tác trả nợ.',
  ].join('\n'), Markup.inlineKeyboard([
    Markup.button.callback('🚫 Xác nhận hủy', `pending:save:${token}`),
    Markup.button.callback('Giữ lại', `pending:cancel:${token}`),
  ]));
}

async function requestTransactionChange(ctx, {
  transaction,
  newAmount = null,
  newDescription = null,
  reason,
  createPending,
}) {
  if (newAmount !== null && (!Number.isSafeInteger(newAmount) || newAmount <= 0)) {
    throw new InputError('Số tiền mới không hợp lệ.');
  }
  const kind = newAmount === null ? 'transaction_cancel' : 'transaction_adjust';
  const token = createPending(ctx.from.id, {
    kind,
    ledgerId: transaction.ledger_id,
    transactionId: Number(transaction.id),
    newAmount,
    newDescription,
    reason,
  });
  const lines = newAmount === null
    ? [
      '⚠️ XÁC NHẬN HỦY GIAO DỊCH', '',
      `#${transaction.id} · ${formatMoney(transaction.amount)}`,
      transaction.description,
      '', 'Giao dịch sẽ không còn được tính trong báo cáo và ngân sách.',
    ]
    : [
      '✏️ XÁC NHẬN ĐIỀU CHỈNH', '',
      `Giao dịch #${transaction.id}`,
      `Từ ${formatMoney(transaction.amount)} → ${formatMoney(newAmount)}`,
      `Ghi chú: ${newDescription || transaction.description}`,
    ];
  return ctx.reply(lines.join('\n'), Markup.inlineKeyboard([
    Markup.button.callback('✅ Xác nhận', `pending:save:${token}`),
    Markup.button.callback('❌ Hủy', `pending:cancel:${token}`),
  ]));
}

module.exports = {
  debtDirection,
  debtListView,
  debtCandidateKeyboard,
  requestDebtPaymentConfirmation,
  requestDebtCancellation,
  requestTransactionChange,
};
