const { unzipSync, strFromU8 } = require('fflate');
const { InputError } = require('../domain/errors');
const { detectCategoryId, normalizeForCategory } = require('./category');

const MAX_ROWS = 300;

function decodeXml(value = '') {
  return String(value)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = [';', '\t', ','].sort((a, b) =>
    firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      cell += '"'; index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function columnIndex(reference) {
  const letters = String(reference).match(/[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseXlsx(buffer) {
  let files;
  try { files = unzipSync(new Uint8Array(buffer)); } catch { throw new InputError('File XLSX không hợp lệ.'); }
  const sharedXml = files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : '';
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map((match) => decodeXml([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((part) => part[1]).join('')));
  const sheetName = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new InputError('Không tìm thấy sheet dữ liệu trong file XLSX.');
  const sheet = strFromU8(files[sheetName]);
  return [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1]; const body = cellMatch[2];
      const reference = attributes.match(/\br="([^"]+)"/)?.[1] || 'A1';
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        ?? body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '';
      row[columnIndex(reference)] = type === 's' ? shared[Number(raw)] || '' : decodeXml(raw);
    }
    return row.map((value) => String(value ?? '').trim());
  }).filter((row) => row.some(Boolean));
}

function parseMoney(value) {
  const raw = String(value ?? '').trim().replace(/\s|₫|đ|vnd/giu, '');
  if (!raw) return 0;
  const negative = /^-/.test(raw) || /^\(.+\)$/.test(raw);
  let normalized = raw.replace(/[()-]/g, '');
  const separators = normalized.match(/[.,]/g) || [];
  if (separators.length) {
    const last = Math.max(normalized.lastIndexOf('.'), normalized.lastIndexOf(','));
    const decimals = normalized.length - last - 1;
    normalized = decimals === 2 && separators.length === 1
      ? normalized.replace(',', '.')
      : normalized.replace(/[.,]/g, '');
  }
  const amount = Math.round(Number(normalized));
  return Number.isFinite(amount) ? (negative ? -amount : amount) : 0;
}

function excelDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20_000 || serial > 80_000) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
}

function parseDate(value) {
  const fromExcel = excelDate(value);
  if (fromExcel) return fromExcel.toISOString();
  const text = String(value || '').trim();
  let match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) return new Date(Date.UTC(
    Number(match[3]), Number(match[2]) - 1, Number(match[1]),
    Number(match[4] || 12), Number(match[5] || 0),
  )).toISOString();
  match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)).toISOString();
  return null;
}

function findHeader(rows) {
  const tokens = ['ngay', 'date', 'noi dung', 'description', 'dien giai', 'so tien', 'amount', 'ghi no', 'debit', 'ghi co', 'credit'];
  const index = rows.slice(0, 20).findIndex((row) => {
    const text = normalizeForCategory(row.join(' '));
    return tokens.filter((token) => text.includes(token)).length >= 2;
  });
  return index < 0 ? 0 : index;
}

function headerMap(headers) {
  const normalized = headers.map(normalizeForCategory);
  const find = (...patterns) => normalized.findIndex((header) => patterns.some((pattern) => header.includes(pattern)));
  return {
    date: find('ngay giao dich', 'ngay', 'date', 'transaction date'),
    description: find('noi dung', 'dien giai', 'mo ta', 'description', 'narrative', 'remark'),
    debit: find('ghi no', 'debit', 'rut', 'chi'),
    credit: find('ghi co', 'credit', 'nap', 'thu'),
    amount: find('so tien', 'amount', 'gia tri'),
    type: find('loai giao dich', 'transaction type', 'type'),
  };
}

function statementRowsToItems(rows) {
  if (rows.length < 2) throw new InputError('File không có đủ dữ liệu giao dịch.');
  const headerIndex = findHeader(rows);
  const map = headerMap(rows[headerIndex]);
  if (map.description < 0 || (map.amount < 0 && map.debit < 0 && map.credit < 0)) {
    throw new InputError('Không nhận diện được cột nội dung và số tiền. Hãy dùng CSV/XLSX có tiêu đề cột rõ ràng.');
  }
  const items = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const description = String(row[map.description] || '').trim().slice(0, 120);
    const debit = map.debit >= 0 ? Math.abs(parseMoney(row[map.debit])) : 0;
    const credit = map.credit >= 0 ? Math.abs(parseMoney(row[map.credit])) : 0;
    const rawAmount = map.amount >= 0 ? parseMoney(row[map.amount]) : 0;
    const typeText = normalizeForCategory(map.type >= 0 ? row[map.type] : '');
    let type; let amount;
    if (debit) { type = 'expense'; amount = debit; }
    else if (credit) { type = 'income'; amount = credit; }
    else if (rawAmount) {
      type = rawAmount < 0 || /chi|debit|rut/.test(typeText) ? 'expense' : 'income';
      amount = Math.abs(rawAmount);
    }
    if (!description || !Number.isSafeInteger(amount) || amount <= 0) continue;
    items.push({
      type, amount, description,
      categoryId: detectCategoryId(description, type),
      occurredAt: map.date >= 0 ? parseDate(row[map.date]) : null,
    });
    if (items.length >= MAX_ROWS) break;
  }
  if (!items.length) throw new InputError('Không nhận diện được giao dịch hợp lệ trong file.');
  return items;
}

function parseBankStatement(buffer, filename = '') {
  const extension = filename.toLowerCase().split('.').pop();
  const rows = extension === 'xlsx'
    ? parseXlsx(buffer)
    : parseCsv(buffer.toString('utf8'));
  return statementRowsToItems(rows);
}

module.exports = { parseBankStatement };
