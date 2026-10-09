const { pool } = require('./database');

async function createTransaction({ userId, type, amount, category, description }) {
  const result = await pool.query(
    `
      INSERT INTO financial_transactions (
        telegram_user_id,
        transaction_type,
        amount,
        category,
        description
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [userId, type, amount, category, description],
  );

  return result.rows[0];
}

async function getMonthlySummary({ userId, month, year, timezone }) {
  const result = await pool.query(
    `
      SELECT
        transaction_type,
        category,
        SUM(amount)::BIGINT AS total
      FROM financial_transactions
      WHERE telegram_user_id = $1
        AND EXTRACT(MONTH FROM created_at AT TIME ZONE $4) = $2
        AND EXTRACT(YEAR FROM created_at AT TIME ZONE $4) = $3
      GROUP BY transaction_type, category
      ORDER BY transaction_type, total DESC
    `,
    [userId, month, year, timezone],
  );

  return result.rows;
}

async function getMonthlyTransactions({ userId, month, year, timezone }) {
  const result = await pool.query(
    `
      SELECT
        id,
        transaction_type,
        amount,
        category,
        description,
        TO_CHAR(
          created_at AT TIME ZONE $4,
          'YYYY-MM-DD HH24:MI:SS'
        ) AS local_created_at
      FROM financial_transactions
      WHERE telegram_user_id = $1
        AND EXTRACT(MONTH FROM created_at AT TIME ZONE $4) = $2
        AND EXTRACT(YEAR FROM created_at AT TIME ZONE $4) = $3
      ORDER BY created_at DESC
    `,
    [userId, month, year, timezone],
  );

  return result.rows;
}

async function getRecentTransactions({ userId, limit, timezone }) {
  const result = await pool.query(
    `
      SELECT
        id,
        transaction_type,
        amount,
        category,
        description,
        TO_CHAR(
          created_at AT TIME ZONE $3,
          'DD/MM/YYYY HH24:MI'
        ) AS local_created_at
      FROM financial_transactions
      WHERE telegram_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, limit, timezone],
  );

  return result.rows;
}

async function deleteTransaction({ userId, transactionId }) {
  const result = await pool.query(
    `
      DELETE FROM financial_transactions
      WHERE id = $1 AND telegram_user_id = $2
      RETURNING id, transaction_type, amount, description
    `,
    [transactionId, userId],
  );

  return result.rows[0] || null;
}

module.exports = {
  createTransaction,
  getMonthlySummary,
  getMonthlyTransactions,
  getRecentTransactions,
  deleteTransaction,
};
