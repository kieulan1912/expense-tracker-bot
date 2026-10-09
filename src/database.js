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
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_created
    ON financial_transactions (telegram_user_id, created_at DESC)
  `);

  await pool.query('SELECT NOW()');
}

module.exports = { pool, initializeDatabase };
