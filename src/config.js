require('dotenv').config();

function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name}`);
  }

  return value;
}

function parseAllowedUserIds(value = '') {
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function createSslConfig(mode) {
  switch (mode.toLowerCase()) {
    case 'disable':
    case 'false':
      return false;
    case 'verify-full':
      return true;
    case 'require':
    case 'true':
      return { rejectUnauthorized: false };
    default:
      throw new Error(
        'DB_SSL chỉ chấp nhận disable, require hoặc verify-full',
      );
  }
}

const port = Number(process.env.SERVER_PORT || process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT không hợp lệ');
}

const config = {
  telegramBotToken: requireEnvironment('TELEGRAM_BOT_TOKEN'),
  databaseUrl: requireEnvironment('DATABASE_URL'),
  databaseSsl: createSslConfig(process.env.DB_SSL || 'disable'),
  allowedUserIds: parseAllowedUserIds(process.env.ALLOWED_USER_IDS),
  timezone: process.env.APP_TIMEZONE?.trim() || 'Asia/Ho_Chi_Minh',
  port,
};

module.exports = { config };
