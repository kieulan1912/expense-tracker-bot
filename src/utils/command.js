const { InputError } = require('../errors');

function getCommandArguments(text, command) {
  const expression = new RegExp(`^/${command}(?:@\\w+)?\\s*`, 'i');
  return String(text || '').replace(expression, '').trim();
}

function parseTransactionInput(text, command) {
  const input = getCommandArguments(text, command);
  const [amountText, ...descriptionParts] = input.split(/\s+/);
  const description = descriptionParts.join(' ').trim();

  if (!amountText || !description) {
    throw new InputError(`Sai cú pháp. Ví dụ: /${command} 50k phở bò`);
  }

  if (description.length > 120) {
    throw new InputError('Ghi chú không được dài quá 120 ký tự.');
  }

  return { amountText, description };
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
  parsePositiveInteger,
};
