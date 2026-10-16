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

module.exports = { summarizeRows, formatMonthlyReport, createChartUrl, formatBudgetStatus };
