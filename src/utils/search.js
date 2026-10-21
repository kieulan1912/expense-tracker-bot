const { InputError } = require('../domain/errors');
const { parseAmount } = require('./amount');
const {
  categories,
  incomeCategories,
  normalizeForCategory,
} = require('./category');

const MAX_SEARCH_RESULTS = 20;

function parseDate(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new InputError('Ngày phải có dạng DD/MM/YYYY.');
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day) {
    throw new InputError('Ngày tìm kiếm không hợp lệ.');
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseSearchMonth(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) throw new InputError('Tháng phải có dạng MM/YYYY.');
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 9999) {
    throw new InputError('Tháng tìm kiếm không hợp lệ.');
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(month).padStart(2, '0')}-${lastDay}`,
  };
}

function resolveCategory(value) {
  const input = String(value || '').trim();
  if (/^\d+$/.test(input)) {
    const categoryId = Number(input);
    if (categories[categoryId] || incomeCategories[categoryId]) return categoryId;
  }
  const target = normalizeForCategory(input);
  const entries = [...Object.entries(categories), ...Object.entries(incomeCategories)];
  const match = entries.find(([, name]) => normalizeForCategory(name) === target);
  if (!match) throw new InputError(`Không nhận ra danh mục “${input}”.`);
  return Number(match[0]);
}

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_RESULTS) {
    throw new InputError(`Giới hạn kết quả phải từ 1 đến ${MAX_SEARCH_RESULTS}.`);
  }
  return limit;
}

function parseSearchInput(input) {
  const segments = String(input || '').split('|').map((part) => part.trim()).filter(Boolean);
  if (!segments.length) {
    throw new InputError('Hãy nhập từ khóa hoặc bộ lọc. Ví dụ: /tim sữa cho con | thang 10/2026');
  }

  const filters = {
    keyword: '',
    transactionType: null,
    categoryId: null,
    amountMin: null,
    amountMax: null,
    dateFrom: null,
    dateTo: null,
    createdBy: '',
    limit: 10,
  };
  const keywordParts = [];

  for (const segment of segments) {
    const normalized = normalizeForCategory(segment);
    let match;
    if (/^(chi|khoan chi)$/.test(normalized)) {
      filters.transactionType = 'expense';
    } else if (/^(thu|khoan thu)$/.test(normalized)) {
      filters.transactionType = 'income';
    } else if ((match = segment.match(/^(?:từ|tu)\s+(.+)$/iu))) {
      filters.dateFrom = parseDate(match[1]);
    } else if ((match = segment.match(/^(?:đến|den)\s+(.+)$/iu))) {
      filters.dateTo = parseDate(match[1]);
    } else if ((match = segment.match(/^(?:ngày|ngay)\s+(.+)$/iu))) {
      filters.dateFrom = parseDate(match[1]);
      filters.dateTo = filters.dateFrom;
    } else if ((match = segment.match(/^(?:tháng|thang)\s+(.+)$/iu))) {
      Object.assign(filters, parseSearchMonth(match[1]));
    } else if ((match = segment.match(/^(?:min|tối thiểu|toi thieu)\s+(.+)$/iu))) {
      filters.amountMin = parseAmount(match[1]);
    } else if ((match = segment.match(/^(?:max|tối đa|toi da)\s+(.+)$/iu))) {
      filters.amountMax = parseAmount(match[1]);
    } else if ((match = segment.match(/^(?:người|nguoi)\s+(.+)$/iu))) {
      filters.createdBy = match[1].trim().slice(0, 80);
    } else if ((match = segment.match(/^danh\s*(?:mục|muc)\s+(.+)$/iu))) {
      filters.categoryId = resolveCategory(match[1]);
    } else if ((match = segment.match(/^(?:limit|giới hạn|gioi han)\s+(\d+)$/iu))) {
      filters.limit = parseLimit(match[1]);
    } else {
      keywordParts.push(segment);
    }
  }

  filters.keyword = keywordParts.join(' ').trim().slice(0, 120);
  if (filters.categoryId >= 91 && filters.categoryId <= 94) {
    if (filters.transactionType === 'expense') {
      throw new InputError('Danh mục thu không thể kết hợp với bộ lọc khoản chi.');
    }
    filters.transactionType = 'income';
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw new InputError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  }
  if (filters.amountMin && filters.amountMax && filters.amountMin > filters.amountMax) {
    throw new InputError('Số tiền tối thiểu phải nhỏ hơn hoặc bằng số tiền tối đa.');
  }
  return filters;
}

module.exports = {
  MAX_SEARCH_RESULTS,
  parseSearchInput,
};
