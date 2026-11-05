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
  scopeLabel = '',
) {
  const { incomeRows, expenseRows, income, expense } = summarizeRows(rows);
  const lines = [
    `📊 BÁO CÁO THÁNG ${month}/${year}${scopeLabel ? ` · ${scopeLabel.toLocaleUpperCase('vi')}` : ''}`,
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
    lines.push(
      '📤 KHOẢN CHI',
      ...expenseRows.map((row) => `• ${row.category}: ${formatMoney(row.total)}`),
      `Tổng tiền đã chi: ${formatMoney(expense)}`,
      '',
    );
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

function formatWeeklySummary(insights, dateParts, ledgerName = '') {
  const current = insights.rows.filter((row) => row.period === 'current');
  const previous = insights.rows.filter((row) => row.period === 'previous');
  const total = (rows, type) => rows
    .filter((row) => row.transaction_type === type)
    .reduce((sum, row) => sum + Number(row.total), 0);
  const currentIncome = total(current, 'income');
  const currentExpense = total(current, 'expense');
  const previousExpense = total(previous, 'expense');
  const difference = currentExpense - previousExpense;
  const expenseCategories = current.filter((row) => row.transaction_type === 'expense');
  const previousByCategory = new Map(previous
    .filter((row) => row.transaction_type === 'expense')
    .map((row) => [Number(row.category_id), Number(row.total)]));
  const rising = expenseCategories
    .map((row) => ({
      ...row,
      increase: Number(row.total) - (previousByCategory.get(Number(row.category_id)) || 0),
    }))
    .filter((row) => row.increase > 0)
    .sort((a, b) => b.increase - a.increase)[0];
  const monthIncome = total(insights.month, 'income');
  const monthExpense = total(insights.month, 'expense');
  const daysInMonth = new Date(Date.UTC(dateParts.year, dateParts.month, 0)).getUTCDate();
  const projectedIncome = Math.round(monthIncome / Math.max(1, dateParts.day) * daysInMonth);
  const projectedExpense = Math.round(monthExpense / Math.max(1, dateParts.day) * daysInMonth);
  const lines = [
    `🗓 TỔNG KẾT TUẦN · đến ${dateParts.day}/${dateParts.month}/${dateParts.year}`,
    ...(ledgerName ? [`📒 ${ledgerName}`] : []), '',
    `Tổng thu tuần: ${formatMoney(currentIncome)}`,
    `Tổng chi tuần: ${formatMoney(currentExpense)}`,
    previousExpense > 0
      ? `${difference > 0 ? '📈' : '📉'} So với tuần trước: ${difference > 0 ? 'tăng' : 'giảm'} ${formatMoney(Math.abs(difference))}`
      : 'Tuần trước chưa có đủ dữ liệu để so sánh.',
  ];
  if (rising) lines.push(`Danh mục tăng mạnh: ${getCategoryName(rising.category_id)} (+${formatMoney(rising.increase)})`);
  if (insights.largest) lines.push(`Khoản chi lớn nhất: ${formatMoney(insights.largest.amount)} · ${insights.largest.description}`);
  lines.push('', '🔭 DỰ BÁO CUỐI THÁNG',
    `Thu: ${formatMoney(projectedIncome)} · Chi: ${formatMoney(projectedExpense)}`,
    `Chênh lệch dự kiến: ${formatMoney(projectedIncome - projectedExpense)}`);
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
    const projected = Number(row.projected_spent || row.spent);
    if (projected > Number(row.amount) && Number(row.spent) < Number(row.amount)) {
      lines.push(`📈 Dự báo cuối tháng: ${formatMoney(projected)} · có thể vượt ${formatMoney(projected - Number(row.amount))}`);
    }
  }
  return lines.join('\n');
}

function formatBudgetForecast(rows) {
  const warnings = rows.flatMap((row) => {
    const budget = Number(row.amount);
    const spent = Number(row.spent);
    const projected = Number(row.projected_spent || spent);
    if (projected <= budget || spent >= budget) return [];
    const label = row.category_id === null ? 'tổng ngân sách' : getCategoryName(row.category_id);
    return [`📈 Nếu giữ nhịp này, ${label} có thể vượt ${formatMoney(projected - budget)} vào cuối tháng.`];
  });
  return warnings.join('\n');
}

function formatSpendingInsights(insights) {
  const { month, year } = insights.period;
  const scopeLabel = insights.scope === 'child' ? 'CHI CHO CON NHỎ' : 'CHI TIÊU';
  if (!insights.transactionCount) {
    return insights.scope === 'child'
      ? `📭 Chưa nhận diện được khoản chi cho con nhỏ trong tháng ${month}/${year}. Hãy ghi rõ “cho con”, “sữa”, “bỉm”, “học phí bé”… để bot phân tích chính xác hơn.`
      : `📭 Chưa có khoản chi trong tháng ${month}/${year}.`;
  }
  const comparison = insights.previousTotal > 0
    ? `${insights.change >= 0 ? 'tăng' : 'giảm'} ${formatMoney(Math.abs(insights.change))} (${Math.abs(insights.changePercent)}%) so với ${insights.previousPeriod.month}/${insights.previousPeriod.year}`
    : `tháng ${insights.previousPeriod.month}/${insights.previousPeriod.year} chưa có dữ liệu đối chiếu`;
  const lines = [
    `🔎 PHÂN TÍCH ${scopeLabel} THÁNG ${month}/${year}`,
    '',
    `Tổng: ${formatMoney(insights.total)} · ${insights.transactionCount} giao dịch`,
    `So sánh: ${comparison}.`,
  ];
  if (insights.categories.length) {
    lines.push('', 'Nhóm đóng góp nhiều nhất:', ...insights.categories.slice(0, 3).map((row) =>
      `• ${row.category}: ${formatMoney(row.total)}${row.change > 0 ? ` · tăng ${formatMoney(row.change)}` : ''}`));
  }
  if (insights.topTransactions.length) {
    lines.push('', 'Khoản lớn nhất:', ...insights.topTransactions.slice(0, 3).map((row) =>
      `• ${formatMoney(row.amount)} · ${row.description} · ${row.date}`));
  }
  if (insights.scope === 'child') {
    lines.push('', 'ℹ️ Nhóm “cho con” được nhận diện từ nội dung giao dịch; các ghi chú quá chung có thể chưa được tính.');
  }
  return lines.join('\n');
}

module.exports = {
  summarizeRows,
  formatMonthlyReport,
  formatDailyReport,
  formatWeeklySummary,
  selectDailyReminder,
  createChartUrl,
  formatBudgetStatus,
  formatBudgetForecast,
  formatSpendingInsights,
};
