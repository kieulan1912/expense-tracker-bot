const { Markup } = require('telegraf');
const { formatMoney } = require('../../utils/amount');

async function findDuplicates(transactions, ledgerId, items) {
  return transactions.findRecentDuplicates({ ledgerId, items, windowMinutes: 30 });
}

function duplicateText(duplicates) {
  const lines = duplicates.slice(0, 5).map(({ item, transaction }) =>
    `• ${formatMoney(item.amount)} · ${item.description} (giống #${transaction.id})`);
  return [
    '⚠️ Có vẻ khoản này vừa được ghi trong 30 phút gần đây:',
    ...lines,
    '',
    'Bạn vẫn muốn lưu chứ?',
  ].join('\n');
}

async function suggestRecurring(ctx, transactions, saved, ledgerId = ctx.state.ledger.id) {
  const list = Array.isArray(saved) ? saved : [saved];
  for (const transaction of list) {
    const candidate = await transactions.detectRecurringCandidate({
      ledgerId,
      transactionId: transaction.id,
    });
    if (!candidate) continue;
    await ctx.reply(
      [
        '🔁 Tôi nhận thấy khoản này lặp lại theo tháng:',
        `${candidate.description} · ${formatMoney(candidate.amount)}`,
        `Đã xuất hiện ${candidate.occurrences} tháng, thường vào khoảng ngày ${candidate.dayOfMonth}.`,
        '',
        'Tạo nhắc định kỳ chứ? Bot vẫn hỏi trước khi ghi mỗi kỳ.',
      ].join('\n'),
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Tạo định kỳ', `recurring:suggest:${candidate.transactionId}`),
        Markup.button.callback('⏭ Không cần', `recurring:dismiss:${candidate.transactionId}`),
      ]),
    );
    return candidate;
  }
  return null;
}

module.exports = { findDuplicates, duplicateText, suggestRecurring };
