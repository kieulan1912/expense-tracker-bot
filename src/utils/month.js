const { InputError } = require('../errors');

function getCurrentMonth(timezone) {
  const { month, year } = getCurrentDateParts(timezone);
  return { month, year };
}

function getCurrentDateParts(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    month: Number(values.month),
    year: Number(values.year),
    day: Number(values.day),
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

module.exports = { parseMonth, getCurrentMonth, getCurrentDateParts };
