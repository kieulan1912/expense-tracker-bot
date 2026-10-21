const { InputError } = require('../domain/errors');
const { parseAmount } = require('./amount');

function getCommandArguments(text, command) {
  const expression = new RegExp(`^/${command}(?:@\\w+)?\\s*`, 'i');
  return String(text || '').replace(expression, '').trim();
}

function getTransactionExamples(command) {
  if (command === 'thu') {
    return {
      primary: '/thu 15tr lương tháng 10',
      flexible: '/thu lương tháng 10 15tr',
    };
  }
  return {
    primary: '/chi 50k phở bò',
    flexible: '/chi phở bò 50k',
  };
}

function parseTransactionInput(text, command) {
  const examples = getTransactionExamples(command);
  const input = getCommandArguments(text, command);
  const parts = input.split(/\s+/).filter(Boolean);
  const candidates = [];

  for (let start = 0; start < parts.length; start += 1) {
    for (const width of [2, 1]) {
      const end = start + width;
      if (end > parts.length) continue;
      if (width === 2) {
        const unit = parts[start + 1].toLocaleLowerCase('vi');
        const isStandaloneUnit = /^(?:kđ|k|tr|m|triệu|trieu|củ|cu|nghìn|nghin|ngàn|ngan|lít|lit|lét|let|tờ|to|vnđ|vnd|đ|₫)$/.test(unit);
        if (!isStandaloneUnit) continue;
      }
      const amountText = parts.slice(start, end).join(' ');
      const parseableAmountText = amountText.replace(/vnđ/giu, 'VND');
      const compact = amountText.toLocaleLowerCase('vi').replace(/\s+/g, '');
      const hasMoneyMarker = /(?:kđ|k|tr|m|triệu|trieu|củ|cu|nghìn|nghin|ngàn|ngan|lít|lit|lét|let|tờ|to|đ|vnd)$/.test(compact);
      const hasThousandsSeparator = /^\d{1,3}(?:[.,]\d{3})+$/.test(compact);
      const plainAmount = /^\d+$/.test(compact) && Number(compact) >= 1_000;
      if (!hasMoneyMarker && !hasThousandsSeparator && !plainAmount) continue;

      try {
        parseAmount(parseableAmountText);
        candidates.push({
          start,
          end,
          amountText: parseableAmountText,
          explicit: hasMoneyMarker || hasThousandsSeparator,
        });
      } catch {
        // Không phải biểu diễn tiền hợp lệ; tiếp tục tìm ở vị trí khác.
      }
    }
  }

  const preferred = candidates.some((candidate) => candidate.explicit)
    ? candidates.filter((candidate) => candidate.explicit)
    : candidates;
  const nonOverlapping = preferred.filter((candidate) =>
    !preferred.some((other) =>
      other !== candidate
      && other.start <= candidate.start
      && other.end >= candidate.end
      && other.end - other.start > candidate.end - candidate.start),
  );

  if (nonOverlapping.length > 1) {
    throw new InputError(`Chỉ nhập một số tiền. Ví dụ: ${examples.flexible}`);
  }

  const amount = nonOverlapping[0];
  const description = amount
    ? parts.filter((_, index) => index < amount.start || index >= amount.end).join(' ').trim()
    : '';

  if (!amount || !description) {
    throw new InputError(`Sai cú pháp. Ví dụ: ${examples.primary} hoặc ${examples.flexible}`);
  }

  if (description.length > 120) {
    throw new InputError('Ghi chú không được dài quá 120 ký tự.');
  }

  return { amountText: amount.amountText, description };
}

function parseMultipleExpenseInput(text) {
  const input = getCommandArguments(text, 'chi');
  const sharedAmount = input.match(
    /^(biếu|tặng|cho)\s+(.+?)\s+mỗi\s+người\s+(.+)$/iu,
  );
  if (sharedAmount) {
    const people = sharedAmount[2]
      .split(/\s*(?:\+|,|\bvà\b)\s*/iu)
      .map((name) => name.trim())
      .filter(Boolean);
    if (people.length < 2) return null;
    const amount = parseAmount(sharedAmount[3].replace(/vnđ/giu, 'VND'));
    return people.map((personName) => ({
      amount,
      description: `${sharedAmount[1].toLowerCase()} ${personName}`,
      personName: personName.slice(0, 80),
    }));
  }

  if (!input.includes(';')) return null;
  const segments = input.split(';').map((part) => part.trim()).filter(Boolean);
  if (segments.length < 2 || segments.length > 10) {
    throw new InputError('Mỗi lần chỉ ghi từ 2 đến 10 khoản, ngăn cách bằng dấu chấm phẩy.');
  }
  return segments.map((segment) => {
    const { amountText, description } = parseTransactionInput(`/chi ${segment}`, 'chi');
    const recipient = description.match(/^(?:biếu|tặng|cho)\s+(.+)$/iu)?.[1]?.trim() || null;
    return {
      amount: parseAmount(amountText),
      description,
      personName: recipient?.slice(0, 80) || null,
    };
  });
}

function parsePositiveInteger(input, label) {
  if (!/^\d+$/.test(input)) {
    throw new InputError(`${label} không hợp lệ.`);
  }

  const value = Number(input);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InputError(`${label} không hợp lệ.`);
  }

  return value;
}

module.exports = {
  getCommandArguments,
  parseTransactionInput,
  parseMultipleExpenseInput,
  parsePositiveInteger,
};
