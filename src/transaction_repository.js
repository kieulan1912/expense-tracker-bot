const { pool } = require('./database');
const { getCategoryName } = require('./utils/category');

function mapTransaction(row) {
  if (!row) return null;
  return {
    ...row,
    category:
      Number(row.category_id) === 99 && row.category && row.category !== 'Khác'
        ? row.category
        : getCategoryName(row.category_id, row.transaction_type),
  };
}

async function createTransaction({ userId, ledgerId, type, amount, categoryId = 99, description, occurredAt = null, source = 'command', sourceKey = null }) {
  const result = await pool.query(
    `INSERT INTO financial_transactions (
       telegram_user_id, ledger_id, created_by_user_id, transaction_type,
       amount, category, category_id, description, occurred_at, source, source_key
     ) VALUES ($1, $2, $1, $3, $4, $5, $6, $7,
       COALESCE($8, CURRENT_TIMESTAMP), $9, $10)
     ON CONFLICT (ledger_id, source_key) WHERE source_key IS NOT NULL
     DO NOTHING
     RETURNING id, transaction_type, amount, category_id, description,
       occurred_at, source, created_by_user_id`,
    [userId, ledgerId, type, amount, getCategoryName(categoryId, type), categoryId, description, occurredAt, source, sourceKey],
  );
  return mapTransaction(result.rows[0]);
}

async function createTransactions({ userId, ledgerId, items, source = 'ai', sourceKey = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const [index, item] of items.entries()) {
      const result = await client.query(
        `INSERT INTO financial_transactions (
           telegram_user_id, ledger_id, created_by_user_id, transaction_type,
           amount, category, category_id, description, occurred_at, source, source_key
         ) VALUES ($1, $2, $1, $3, $4, $5, $6, $7,
           COALESCE($8, CURRENT_TIMESTAMP), $9, $10)
         ON CONFLICT (ledger_id, source_key) WHERE source_key IS NOT NULL
         DO NOTHING
         RETURNING id, transaction_type, amount, category_id, description,
           occurred_at, source, created_by_user_id`,
        [userId, ledgerId, item.type, item.amount, getCategoryName(item.categoryId, item.type), item.categoryId, item.description, item.occurredAt || null, source, sourceKey ? `${sourceKey}:${index}` : null],
      );
      if (result.rows[0]) saved.push(mapTransaction(result.rows[0]));
    }
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getMonthlySummary({ ledgerId, month, year, timezone }) {
  const result = await pool.query(
    `WITH normalized AS (
       SELECT transaction_type, amount, category,
         CASE
           WHEN category_id <> 99 THEN category_id
           WHEN transaction_type = 'expense' AND category = 'Ăn uống' THEN 1
           WHEN transaction_type = 'expense' AND category = 'Di chuyển' THEN 2
           WHEN transaction_type = 'expense'
             AND category IN ('Hóa đơn', 'Hóa đơn & sinh hoạt') THEN 3
           WHEN transaction_type = 'expense'
             AND category IN ('Mua sắm', 'Giải trí', 'Mua sắm & giải trí') THEN 4
           WHEN transaction_type = 'expense' AND category = 'Sức khỏe' THEN 5
           WHEN transaction_type = 'expense'
             AND category IN ('Giáo dục', 'Giáo dục & phát triển') THEN 6
           WHEN transaction_type = 'expense'
             AND category = 'Cho tặng & gia đình' THEN 7
           WHEN transaction_type = 'income' AND category = 'Lương' THEN 91
           WHEN transaction_type = 'income' AND category = 'Thưởng' THEN 92
           WHEN transaction_type = 'income' AND category = 'Đầu tư' THEN 93
           WHEN transaction_type = 'income' AND category = 'Kinh doanh' THEN 94
           ELSE 99
         END AS normalized_category_id
       FROM financial_transactions
       WHERE ledger_id = $1
         AND EXTRACT(MONTH FROM occurred_at AT TIME ZONE $4) = $2
         AND EXTRACT(YEAR FROM occurred_at AT TIME ZONE $4) = $3
     )
     SELECT transaction_type, normalized_category_id AS category_id,
            MAX(category) AS legacy_category, SUM(amount)::BIGINT AS total
     FROM normalized
     GROUP BY transaction_type, normalized_category_id
     ORDER BY transaction_type, total DESC`,
    [ledgerId, month, year, timezone],
  );
  return result.rows.map((row) => ({
    ...row,
    category: Number(row.category_id) === 99 && row.legacy_category !== 'Khác'
      ? row.legacy_category
      : getCategoryName(row.category_id, row.transaction_type),
  }));
}

async function getMonthlyTransactions({ ledgerId, month, year, timezone }) {
  const result = await pool.query(
    `SELECT id, transaction_type, amount, category, category_id, description,
       TO_CHAR(t.occurred_at AT TIME ZONE $4, 'YYYY-MM-DD HH24:MI:SS') AS local_created_at,
       COALESCE(u.display_name, u.username, t.created_by_user_id::TEXT) AS created_by_name
     FROM financial_transactions t
     LEFT JOIN user_preferences u ON u.telegram_user_id = t.created_by_user_id
     WHERE t.ledger_id = $1
       AND EXTRACT(MONTH FROM occurred_at AT TIME ZONE $4) = $2
       AND EXTRACT(YEAR FROM occurred_at AT TIME ZONE $4) = $3
     ORDER BY occurred_at DESC`,
    [ledgerId, month, year, timezone],
  );
  return result.rows.map(mapTransaction);
}

async function getRecentTransactions({ ledgerId, limit, timezone }) {
  const result = await pool.query(
    `SELECT t.id, t.transaction_type, t.amount, t.category, t.category_id,
       t.description, t.created_by_user_id,
       COALESCE(u.display_name, u.username, t.created_by_user_id::TEXT) AS created_by_name,
       TO_CHAR(t.occurred_at AT TIME ZONE $3, 'DD/MM/YYYY HH24:MI') AS local_created_at
     FROM financial_transactions t
     LEFT JOIN user_preferences u ON u.telegram_user_id = t.created_by_user_id
     WHERE t.ledger_id = $1
     ORDER BY t.occurred_at DESC LIMIT $2`,
    [ledgerId, limit, timezone],
  );
  return result.rows.map(mapTransaction);
}

async function deleteTransaction({ userId, ledgerId, transactionId }) {
  const result = await pool.query(
    `DELETE FROM financial_transactions
     WHERE id = $1 AND ledger_id = $2
       AND EXISTS (
         SELECT 1 FROM ledger_members m
         WHERE m.ledger_id = $2 AND m.telegram_user_id = $3
           AND (m.role = 'owner' OR financial_transactions.created_by_user_id = $3)
       )
     RETURNING id, transaction_type, amount, category_id, description`,
    [transactionId, ledgerId, userId],
  );
  return mapTransaction(result.rows[0]);
}

async function getSpendingBetween({ ledgerId, start, end, categoryId = null }) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
     FROM financial_transactions
     WHERE ledger_id = $1 AND transaction_type = 'expense'
       AND occurred_at >= $2 AND occurred_at < $3
       AND ($4::SMALLINT IS NULL OR category_id = $4)`,
    [ledgerId, start, end, categoryId],
  );
  return Number(result.rows[0].total);
}

async function deleteAllUserData(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sharedOwned = await client.query(
      `SELECT COUNT(*)::INTEGER AS count FROM ledgers
       WHERE owner_user_id = $1 AND kind = 'shared'`,
      [userId],
    );
    if (sharedOwned.rows[0].count > 0) {
      await client.query('ROLLBACK');
      return { blocked: true, sharedLedgers: sharedOwned.rows[0].count };
    }
    await client.query(
      `DELETE FROM ledgers WHERE owner_user_id = $1 AND kind = 'personal'`,
      [userId],
    );
    await client.query('DELETE FROM ledger_members WHERE telegram_user_id = $1', [userId]);
    await client.query('DELETE FROM ai_usage_daily WHERE telegram_user_id = $1', [userId]);
    await client.query('DELETE FROM user_preferences WHERE telegram_user_id = $1', [userId]);
    await client.query('COMMIT');
    return { blocked: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createTransaction,
  createTransactions,
  getMonthlySummary,
  getMonthlyTransactions,
  getRecentTransactions,
  deleteTransaction,
  getSpendingBetween,
  deleteAllUserData,
};
