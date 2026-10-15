const { Pool } = require('pg');
const { config } = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  console.error('PostgreSQL pool error:', error);
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS financial_transactions (
      id BIGSERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      transaction_type VARCHAR(10) NOT NULL
        CHECK (transaction_type IN ('expense', 'income')),
      amount BIGINT NOT NULL CHECK (amount > 0),
      category VARCHAR(50) NOT NULL DEFAULT 'Khác',
      category_id SMALLINT NOT NULL DEFAULT 99,
      description TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      source VARCHAR(20) NOT NULL DEFAULT 'command',
      source_key VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE financial_transactions
      ADD COLUMN IF NOT EXISTS category_id SMALLINT NOT NULL DEFAULT 99,
      ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'command',
      ADD COLUMN IF NOT EXISTS source_key VARCHAR(100)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_created
    ON financial_transactions (telegram_user_id, occurred_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_occurred
    ON financial_transactions (telegram_user_id, occurred_at DESC)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transactions_source_key
    ON financial_transactions (telegram_user_id, source_key)
    WHERE source_key IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      telegram_user_id BIGINT PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
      personality VARCHAR(20) NOT NULL DEFAULT 'funny'
        CHECK (personality IN ('gentle', 'funny', 'direct')),
      ocr_consent BOOLEAN NOT NULL DEFAULT FALSE,
      reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      plan VARCHAR(12) NOT NULL DEFAULT 'free',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budgets (
      id BIGSERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      category_id SMALLINT,
      amount BIGINT NOT NULL CHECK (amount > 0),
      month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
      year SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 9999),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (telegram_user_id, category_id, month, year)
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_total_unique
    ON budgets (telegram_user_id, month, year)
    WHERE category_id IS NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS debts (
      id BIGSERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      person_name VARCHAR(80) NOT NULL,
      debt_type SMALLINT NOT NULL CHECK (debt_type IN (1, 2)),
      original_amount BIGINT NOT NULL CHECK (original_amount > 0),
      remaining_amount BIGINT NOT NULL CHECK (remaining_amount >= 0),
      description VARCHAR(120) NOT NULL DEFAULT '',
      due_date DATE,
      last_reminded_on DATE,
      status VARCHAR(12) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'paid')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE debts
      ADD COLUMN IF NOT EXISTS last_reminded_on DATE
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debts_user_status
    ON debts (telegram_user_id, status, due_date)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS debt_payments (
      id BIGSERIAL PRIMARY KEY,
      debt_id BIGINT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
      amount BIGINT NOT NULL CHECK (amount > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_transactions (
      id BIGSERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      transaction_type VARCHAR(10) NOT NULL
        CHECK (transaction_type IN ('expense', 'income')),
      amount BIGINT NOT NULL CHECK (amount > 0),
      category_id SMALLINT NOT NULL DEFAULT 99,
      description VARCHAR(120) NOT NULL,
      day_of_month SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_prompted_on DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage_daily (
      usage_date DATE NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      request_type VARCHAR(10) NOT NULL CHECK (request_type IN ('text', 'image')),
      request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
      PRIMARY KEY (usage_date, telegram_user_id, request_type)
    )
  `);

  await pool.query('SELECT NOW()');
}

module.exports = { pool, initializeDatabase };
