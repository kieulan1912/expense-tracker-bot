const { InputError } = require('../errors');

function getCurrentMonth(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    month: Number(values.month),
    year: Number(values.year),
  };
}

function parseMonth(input, timezone) {
  if (!input) {
    return getCurrentMonth(timezone);
  }

  const match = input.match(/^(\d{1,2})\/(\d{4})$/);

  if (!match) {
    throw new InputError('Tháng phải có định dạng MM/YYYY, ví dụ 10/2026.');
  }

  const month = Number(match[1]);
  const year = Number(match[2]);

  if (month < 1 || month > 12 || year < 2000 || year > 9999) {
    throw new InputError('Tháng hoặc năm không hợp lệ.');
  }

  return { month, year };
}

module.exports = { parseMonth, getCurrentMonth };
