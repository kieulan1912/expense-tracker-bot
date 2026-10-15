const { Markup } = require('telegraf');
const { formatMonthlyReport } = require('../../domain/services/report_service');
const { formatMoney } = require('../../utils/amount');

const DAY_MS = 24 * 60 * 60 * 1000;

function createScheduler({ config, finance, users, transactions }) {
  const {
    getDueRecurring,
    markRecurringPrompted,
    getDueDebts,
    markDebtReminded,
  } = finance;
  const { getReminderUsers } = users;
  const { getMonthlySummary } = transactions;

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), weekday: values.weekday };
}

async function runDailyJobs(telegram) {
  const now = localDateParts();
  const isoDate = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
  const recurring = await getDueRecurring(now.day, isoDate);
  for (const item of recurring) {
    await telegram.sendMessage(
      item.chat_id,
      `🔁 Đến kỳ: ${item.description} · ${formatMoney(item.amount)}\nBạn muốn ghi giao dịch này chứ?`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Ghi', `recurring:post:${item.id}`),
        Markup.button.callback('⏭ Bỏ qua', `recurring:skip:${item.id}`),
      ]),
    ).then(() => markRecurringPrompted(item.id, isoDate)).catch((error) => {
      console.error('Không thể gửi nhắc giao dịch định kỳ:', error.message);
    });
  }

  const debts = await getDueDebts(isoDate);
  for (const debt of debts) {
    const due = String(debt.due_date).slice(0, 10);
    const label = Number(debt.debt_type) === 1
      ? `${debt.person_name} đang nợ bạn`
      : `Bạn đang nợ ${debt.person_name}`;
    await telegram.sendMessage(
      debt.chat_id,
      `⏰ Nhắc công nợ #${debt.id}\n${label}: ${formatMoney(debt.remaining_amount)}\nHạn: ${due}`,
    ).then(() => markDebtReminded(debt.id, isoDate)).catch((error) => {
      console.error('Không thể gửi nhắc công nợ:', error.message);
    });
  }

  const lastDay = new Date(now.year, now.month, 0).getDate();
  if (now.weekday !== 'Sun' && now.day !== lastDay) return;
  const users = await getReminderUsers();
  for (const user of users) {
    if (!user.active_ledger_id) continue;
    const rows = await getMonthlySummary({ ledgerId: user.active_ledger_id, month: now.month, year: now.year, timezone: user.timezone });
    if (!rows.length) continue;
    const prefix = now.day === lastDay ? '🗓 Tổng kết cuối tháng\n\n' : '🗓 Điểm lại tuần này (lũy kế tháng)\n\n';
    await telegram.sendMessage(user.chat_id, prefix + formatMonthlyReport(rows, now.month, now.year, user.active_ledger_name)).catch((error) => {
      console.error('Không thể gửi báo cáo định kỳ:', error.message);
    });
  }
}

function msUntilNextRun() {
  const now = new Date();
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, hour: '2-digit', hour12: false }).format(now));
  const localMinute = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, minute: '2-digit' }).format(now));
  const elapsed = (localHour * 60 + localMinute) * 60 * 1000;
  const target = 20 * 60 * 60 * 1000;
  return target > elapsed ? target - elapsed : DAY_MS - elapsed + target;
}

function startScheduler(telegram) {
  if (!config.schedulerEnabled) return () => {};
  let interval;
  const timeout = setTimeout(() => {
    runDailyJobs(telegram).catch((error) => console.error('Scheduler error:', error));
    interval = setInterval(() => runDailyJobs(telegram).catch((error) => console.error('Scheduler error:', error)), DAY_MS);
  }, msUntilNextRun());
  timeout.unref();
  return () => { clearTimeout(timeout); if (interval) clearInterval(interval); };
}

  return { startScheduler, runDailyJobs, localDateParts };
}

module.exports = { createScheduler };
