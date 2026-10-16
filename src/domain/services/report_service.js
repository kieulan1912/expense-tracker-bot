const { formatMoney } = require('../../utils/amount');
const { getCategoryName } = require('../../utils/category');

function summarizeRows(rows) {
  const incomeRows = rows.filter((row) => row.transaction_type === 'income');
  const expenseRows = rows.filter((row) => row.transaction_type === 'expense');
  const income = incomeRows.reduce((sum, row) => sum + Number(row.total), 0);
  const expense = expenseRows.reduce((sum, row) => sum + Number(row.total), 0);
  return { incomeRows, expenseRows, income, expense };
}

function formatMonthlyReport(
  rows,
  month,
  year,
  ledgerName = '',
  budgetRows = [],
  asOfDateParts = null,
) {
  const { incomeRows, expenseRows, income, expense } = summarizeRows(rows);
  const lines = [
    `📊 BÁO CÁO THÁNG ${month}/${year}`,
    ...(asOfDateParts
      ? [`🗓 Tính đến ngày ${asOfDateParts.day}/${asOfDateParts.month}/${asOfDateParts.year}`]
      : []),
    ...(ledgerName ? [`📒 ${ledgerName}`] : []),
    '',
  ];
  if (incomeRows.length) {
    lines.push('📥 KHOẢN THU', ...incomeRows.map((row) => `• ${row.category}: ${formatMoney(row.total)}`), '');
  }
  if (expenseRows.length) {
    lines.push('📤 KHOẢN CHI', ...expenseRows.map((row) => `• ${row.category}: ${formatMoney(row.total)}`), '');
  }
  lines.push(
    `Tổng thu tháng ${month}/${year}: ${formatMoney(income)}`,
    `Tổng chi tháng ${month}/${year}: ${formatMoney(expense)}`,
    `Chênh lệch thu–chi: ${formatMoney(income - expense)}`,
  );

  const totalBudget = budgetRows.find(
    (row) => row.category_id === null || row.category_id === undefined,
  );
  if (totalBudget) {
    const budget = Number(totalBudget.amount);
    const remaining = budget - expense;
    const usedPercent = budget > 0 ? (expense / budget) * 100 : 0;
    const percentText = new Intl.NumberFormat('vi-VN', {
      maximumFractionDigits: 1,
    }).format(usedPercent);
    lines.push('', `🎯 Ngân sách tháng: ${formatMoney(budget)}`);
    lines.push(remaining >= 0
      ? `💰 Ngân sách còn lại: ${formatMoney(remaining)}`
      : `⚠️ Vượt ngân sách: ${formatMoney(Math.abs(remaining))}`);
    lines.push(`📈 Đã sử dụng: ${percentText}%`);
  }
  return lines.join('\n');
}

const dailyReminderTemplates = Object.freeze({
  funny: {
    empty: [
      'Sổ hôm nay đang im thin thít. Bạn đã note hết chi tiêu chưa đó? 😄',
      '20:00 rồi, ví đã tan ca nhưng sổ chưa chắc. Có khoản nào quên ghi không? 🕵️',
      'Điểm danh cuối ngày: cơm, cà phê, xăng xe… có ai chưa lên sổ không? 😄',
    ],
    recorded: [
      'Sổ đã có dữ liệu rồi. Kiểm tra xem còn khoản nào đang “trốn” chưa nhé 😄',
      'Hôm nay bot đã ghi sổ chăm chỉ. Bạn rà lại một vòng để khỏi sót nhé 🧾',
      'Ví đã kể chuyện hôm nay rồi, nhưng biết đâu vẫn còn một chương chưa note 😄',
    ],
  },
  gentle: {
    empty: ['Bạn dành một phút kiểm tra xem hôm nay còn khoản nào chưa ghi nhé.'],
    recorded: ['Bạn kiểm tra lại các khoản hôm nay để sổ được đầy đủ nhé.'],
  },
  direct: {
    empty: ['Chưa có giao dịch hôm nay. Hãy ghi lại các khoản còn thiếu.'],
    recorded: ['Hãy đối chiếu và bổ sung ngay các giao dịch còn thiếu trong ngày.'],
  },
});

function selectDailyReminder(personality, dateParts, seed, hasTransactions) {
  const style = dailyReminderTemplates[personality] || dailyReminderTemplates.funny;
  const templates = hasTransactions ? style.recorded : style.empty;
  const seedValue = [...String(seed || '')]
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  const index = (dateParts.year * 372 + dateParts.month * 31 + dateParts.day + seedValue)
    % templates.length;
  return templates[index];
}

function formatDailyReport(rows, dateParts, ledgerName = '', reminder = '') {
  const { incomeRows, expenseRows, income, expense } = summarizeRows(rows);
  const date = `${dateParts.day}/${dateParts.month}/${dateParts.year}`;
  const lines = [
    `🌙 TỔNG KẾT HÔM NAY · ${date}`,
    ...(ledgerName ? [`📒 ${ledgerName}`] : []),
    '',
  ];

  if (!rows.length) {
    lines.push('📭 Chưa có giao dịch nào được ghi trong ngày.');
  } else {
    if (incomeRows.length) {
      lines.push(
        '📥 KHOẢN THU',
        ...incomeRows.map((row) => `• ${row.category}: ${formatMoney(row.total)}`),
        '',
      );
    }
    if (expenseRows.length) {
      lines.push(
        '📤 KHOẢN CHI',
        ...expenseRows.map((row) => `• ${row.category}: ${formatMoney(row.total)}`),
        '',
      );
    }
    lines.push(
      `Tổng thu hôm nay: ${formatMoney(income)}`,
      `Tổng chi hôm nay: ${formatMoney(expense)}`,
    );
  }

  if (reminder) lines.push('', `💬 ${reminder}`);
  lines.push('', 'Ghi nhanh: /chi ăn tối 50k');
  return lines.join('\n');
}

function createChartUrl(rows, month, year) {
  const expenseRows = rows.filter((row) => row.transaction_type === 'expense');
  if (!expenseRows.length) return null;
  const config = {
    type: 'doughnut',
    data: {
      labels: expenseRows.map((row) => row.category),
      datasets: [{ data: expenseRows.map((row) => Number(row.total)), backgroundColor: ['#5B8FF9', '#61DDAA', '#65789B', '#F6BD16', '#7262FD', '#78D3F8', '#9661BC', '#F6903D'] }],
    },
    options: { plugins: { title: { display: true, text: `Chi tiêu ${month}/${year}` }, legend: { position: 'bottom' } } },
  };
  return `https://quickchart.io/chart?width=700&height=500&format=png&c=${encodeURIComponent(JSON.stringify(config))}`;
}

function formatBudgetStatus(rows, dateParts) {
  if (!rows.length) return '📭 Bạn chưa đặt ngân sách tháng này.';
  const daysInMonth = new Date(Date.UTC(dateParts.year, dateParts.month, 0)).getUTCDate();
  const remainingDays = Math.max(1, daysInMonth - dateParts.day + 1);
  const lines = ['🎯 NGÂN SÁCH THÁNG NÀY', ''];
  for (const row of rows) {
    const remaining = Number(row.amount) - Number(row.spent);
    const label = row.category_id === null ? 'Tổng chi' : getCategoryName(row.category_id);
    lines.push(`${label}: ${formatMoney(row.spent)} / ${formatMoney(row.amount)}`);
    lines.push(remaining >= 0
      ? `Còn ${formatMoney(remaining)} · khoảng ${formatMoney(Math.floor(remaining / remainingDays))}/ngày`
      : `⚠️ Vượt ${formatMoney(Math.abs(remaining))}`);
  }
  return lines.join('\n');
}

module.exports = {
  summarizeRows,
  formatMonthlyReport,
  formatDailyReport,
  selectDailyReminder,
  createChartUrl,
  formatBudgetStatus,
};
