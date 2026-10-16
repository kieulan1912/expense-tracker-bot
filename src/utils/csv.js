function escapeCsv(value) {
  const text = String(value ?? '');

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function transactionsToCsv(rows) {
  const header = ['Mã', 'Loại', 'Số tiền', 'Danh mục', 'Ghi chú', 'Người ghi', 'Thời gian'];
  const body = rows.map((row) => [
    row.id,
    row.transaction_type === 'expense' ? 'Chi' : 'Thu',
    row.amount,
    row.category,
    row.description,
    row.created_by_name,
    row.local_created_at,
  ]);
  const totalIncome = rows
    .filter((row) => row.transaction_type === 'income')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const totalExpense = rows
    .filter((row) => row.transaction_type === 'expense')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const summary = [
    ['', '', '', '', '', '', ''],
    ['', 'Tổng thu', totalIncome, '', '', '', ''],
    ['', 'Tổng chi', totalExpense, '', '', '', ''],
    ['', 'Chênh lệch thu-chi', totalIncome - totalExpense, '', '', '', ''],
  ];

  return `\uFEFF${[header, ...body, ...summary]
    .map((columns) => columns.map(escapeCsv).join(','))
    .join('\r\n')}`;
}

module.exports = { escapeCsv, transactionsToCsv };
