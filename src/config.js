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

function parsePositiveIntegerEnvironment(name, fallback) {
  const value = Number(process.env[name] || fallback);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} phải là số nguyên dương`);
  }

  return value;
}

function parseBooleanEnvironment(name, fallback = false) {
  const raw = process.env[name];

  if (raw === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
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
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
  geminiModel:
    process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  geminiFallbackModels: (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean),
  aiEnabled: parseBooleanEnvironment('AI_ENABLED', true),
  aiTextDailyLimit: parsePositiveIntegerEnvironment(
    'AI_TEXT_DAILY_LIMIT_PER_USER',
    30,
  ),
  aiImageDailyLimit: parsePositiveIntegerEnvironment(
    'AI_IMAGE_DAILY_LIMIT_PER_USER',
    5,
  ),
  aiGlobalDailyLimit: parsePositiveIntegerEnvironment(
    'AI_GLOBAL_DAILY_LIMIT',
    200,
  ),
  confirmationThreshold: parsePositiveIntegerEnvironment(
    'CONFIRMATION_THRESHOLD_VND',
    1_000_000,
  ),
  botRateLimitPerMinute: parsePositiveIntegerEnvironment(
    'BOT_RATE_LIMIT_PER_MINUTE',
    30,
  ),
  schedulerEnabled: parseBooleanEnvironment('SCHEDULER_ENABLED', true),
  port,
};

module.exports = { config };
