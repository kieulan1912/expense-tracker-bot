function escapeCsv(value) {
  const text = String(value ?? '');

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function transactionsToCsv(rows) {
  const header = ['Mã', 'Loại', 'Số tiền', 'Danh mục', 'Ghi chú', 'Thời gian'];
  const body = rows.map((row) => [
    row.id,
    row.transaction_type === 'expense' ? 'Chi' : 'Thu',
    row.amount,
    row.category,
    row.description,
    row.local_created_at,
  ]);

  return `\uFEFF${[header, ...body]
    .map((columns) => columns.map(escapeCsv).join(','))
    .join('\r\n')}`;
}

module.exports = { escapeCsv, transactionsToCsv };
