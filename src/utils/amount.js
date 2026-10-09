const { InputError } = require('../errors');

function parseAmount(input) {
  const value = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/₫|đ|vnd/g, '');

  if (!value) {
    throw new InputError('Bạn chưa nhập số tiền.');
  }

  let multiplier = 1;
  let numberPart = value;

  if (value.endsWith('tr')) {
    multiplier = 1_000_000;
    numberPart = value.slice(0, -2);
  } else if (value.endsWith('m')) {
    multiplier = 1_000_000;
    numberPart = value.slice(0, -1);
  } else if (value.endsWith('k')) {
    multiplier = 1_000;
    numberPart = value.slice(0, -1);
  }

  let normalized = numberPart;

  if (multiplier > 1) {
    if (!/^\d+(?:[.,]\d+)?$/.test(numberPart)) {
      throw new InputError('Số tiền không hợp lệ. Ví dụ: 50k hoặc 1,5tr.');
    }
    normalized = numberPart.replace(',', '.');
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(numberPart)) {
    normalized = numberPart.replace(/[.,]/g, '');
  } else if (!/^\d+$/.test(numberPart)) {
    throw new InputError('Số tiền không hợp lệ. Ví dụ: 50k hoặc 1,5tr.');
  }

  const amount = Math.round(Number(normalized) * multiplier);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new InputError('Số tiền phải lớn hơn 0 và không được quá lớn.');
  }

  return amount;
}

function formatMoney(amount) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(amount))} VNĐ`;
}

module.exports = { parseAmount, formatMoney };
