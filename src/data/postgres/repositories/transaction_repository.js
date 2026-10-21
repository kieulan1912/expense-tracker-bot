const { getCategoryName, normalizeForCategory } = require('../../../utils/category');

function createTransactionRepository(pool) {

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

async function createTransaction({ userId, ledgerId, type, amount, categoryId = 99, description, counterpartyName = null, occurredAt = null, source = 'command', sourceKey = null }) {
  const result = await pool.query(
    `INSERT INTO financial_transactions (
       telegram_user_id, ledger_id, created_by_user_id, transaction_type,
       amount, category, category_id, description, counterparty_name,
       occurred_at, source, source_key
     ) VALUES ($1, $2, $1, $3, $4, $5, $6, $7,
       $8, COALESCE($9, CURRENT_TIMESTAMP), $10, $11)
     ON CONFLICT (ledger_id, source_key) WHERE source_key IS NOT NULL
     DO NOTHING
     RETURNING id, transaction_type, amount, category_id, description,
       counterparty_name, occurred_at, source, created_by_user_id`,
    [userId, ledgerId, type, amount, getCategoryName(categoryId, type), categoryId, description, counterpartyName, occurredAt, source, sourceKey],
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
           amount, category, category_id, description, counterparty_name,
           occurred_at, source, source_key
         ) VALUES ($1, $2, $1, $3, $4, $5, $6, $7,
           $8, COALESCE($9, CURRENT_TIMESTAMP), $10, $11)
         ON CONFLICT (ledger_id, source_key) WHERE source_key IS NOT NULL
         DO NOTHING
         RETURNING id, transaction_type, amount, category_id, description,
           counterparty_name, occurred_at, source, created_by_user_id`,
        [userId, ledgerId, item.type, item.amount, getCategoryName(item.categoryId, item.type), item.categoryId, item.description, item.personName || null, item.occurredAt || null, source, sourceKey ? `${sourceKey}:${index}` : null],
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
         AND status = 'active'
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
       AND t.status = 'active'
       AND EXTRACT(MONTH FROM occurred_at AT TIME ZONE $4) = $2
       AND EXTRACT(YEAR FROM occurred_at AT TIME ZONE $4) = $3
     ORDER BY occurred_at DESC`,
    [ledgerId, month, year, timezone],
  );
  return result.rows.map(mapTransaction);
}

async function getDailySummary({ ledgerId, date, timezone }) {
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
         AND status = 'active'
         AND (occurred_at AT TIME ZONE $3)::DATE = $2::DATE
     )
     SELECT transaction_type, normalized_category_id AS category_id,
            MAX(category) AS legacy_category, SUM(amount)::BIGINT AS total
     FROM normalized
     GROUP BY transaction_type, normalized_category_id
     ORDER BY transaction_type, total DESC`,
    [ledgerId, date, timezone],
  );
  return result.rows.map((row) => ({
    ...row,
    category: Number(row.category_id) === 99 && row.legacy_category !== 'Khác'
      ? row.legacy_category
      : getCategoryName(row.category_id, row.transaction_type),
  }));
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
       AND t.status = 'active'
     ORDER BY t.occurred_at DESC LIMIT $2`,
    [ledgerId, limit, timezone],
  );
  return result.rows.map(mapTransaction);
}

async function searchTransactions({
  ledgerId,
  keyword = '',
  transactionType = null,
  categoryId = null,
  amountMin = null,
  amountMax = null,
  dateFrom = null,
  dateTo = null,
  createdBy = '',
  limit = 10,
  timezone,
}) {
  // Lấy một tập ứng viên có giới hạn rồi chuẩn hóa dấu bằng JavaScript. Cách này
  // không cần extension PostgreSQL `unaccent`, phù hợp với Neon/free plan.
  const candidateLimit = Math.max(100, Math.min(500, limit * 25));
  const result = await pool.query(
    `SELECT t.id, t.transaction_type, t.amount, t.category, t.category_id,
       t.description, t.counterparty_name, t.created_by_user_id,
       COALESCE(u.display_name, u.username, t.created_by_user_id::TEXT) AS created_by_name,
       TO_CHAR(t.occurred_at AT TIME ZONE $8, 'DD/MM/YYYY HH24:MI') AS local_created_at
     FROM financial_transactions t
     LEFT JOIN user_preferences u ON u.telegram_user_id = t.created_by_user_id
     WHERE t.ledger_id = $1
       AND t.status = 'active'
       AND ($2::TEXT IS NULL OR t.transaction_type = $2)
       AND ($3::SMALLINT IS NULL OR t.category_id = $3)
       AND ($4::BIGINT IS NULL OR t.amount >= $4)
       AND ($5::BIGINT IS NULL OR t.amount <= $5)
       AND ($6::DATE IS NULL OR (t.occurred_at AT TIME ZONE $8)::DATE >= $6)
       AND ($7::DATE IS NULL OR (t.occurred_at AT TIME ZONE $8)::DATE <= $7)
     ORDER BY t.occurred_at DESC
     LIMIT $9`,
    [
      ledgerId, transactionType, categoryId, amountMin, amountMax,
      dateFrom, dateTo, timezone, candidateLimit,
    ],
  );
  const keywordTokens = normalizeForCategory(keyword).split(' ').filter(Boolean);
  const creatorTokens = normalizeForCategory(createdBy).split(' ').filter(Boolean);
  return result.rows.filter((row) => {
    const searchableText = normalizeForCategory([
      row.description,
      row.category,
      row.counterparty_name,
    ].filter(Boolean).join(' '));
    const creatorText = normalizeForCategory(row.created_by_name);
    return keywordTokens.every((token) => searchableText.includes(token))
      && creatorTokens.every((token) => creatorText.includes(token));
  }).slice(0, limit).map(mapTransaction);
}

async function getTransactionById({ ledgerId, transactionId }) {
  const result = await pool.query(
    `SELECT * FROM financial_transactions
     WHERE id = $1 AND ledger_id = $2 AND status = 'active'`,
    [transactionId, ledgerId],
  );
  return mapTransaction(result.rows[0]);
}

async function findRecentExpenseCandidates({ ledgerId, personName = '', amount = null, limit = 10 }) {
  const result = await pool.query(
    `SELECT * FROM financial_transactions
     WHERE ledger_id = $1 AND status = 'active' AND transaction_type = 'expense'
       AND occurred_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
       AND ($2::BIGINT IS NULL OR amount >= $2)
     ORDER BY occurred_at DESC`,
    [ledgerId, amount],
  );
  const target = normalizeForCategory(personName);
  return result.rows
    .filter((row) => !target || normalizeForCategory(
      row.counterparty_name || row.description,
    ).includes(target))
    .slice(0, limit)
    .map(mapTransaction);
}

async function adjustTransaction({
  userId,
  ledgerId,
  transactionId,
  newAmount = null,
  newDescription = null,
  reason = '',
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT t.* FROM financial_transactions t
       WHERE t.id = $1 AND t.ledger_id = $2 AND t.status = 'active'
         AND EXISTS (
           SELECT 1 FROM ledger_members m
           WHERE m.ledger_id = t.ledger_id AND m.telegram_user_id = $3
             AND (m.role = 'owner' OR t.created_by_user_id = $3)
         ) FOR UPDATE OF t`,
      [transactionId, ledgerId, userId],
    );
    const transaction = locked.rows[0];
    if (!transaction) {
      await client.query('ROLLBACK');
      return null;
    }
    const action = newAmount === null ? 'cancel' : 'adjust';
    if (newAmount !== null && (!Number.isSafeInteger(newAmount) || newAmount <= 0)) {
      await client.query('ROLLBACK');
      return { error: 'invalid_amount', transaction };
    }
    await client.query(
      `INSERT INTO transaction_adjustments (
         transaction_id, ledger_id, actor_user_id, action, amount_before,
         amount_after, description_before, description_after, reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [transactionId, ledgerId, userId, action, transaction.amount,
        newAmount, transaction.description, newDescription, reason.slice(0, 160)],
    );
    const result = await client.query(
      `UPDATE financial_transactions SET
         amount = COALESCE($2, amount),
         description = COALESCE($3, description),
         status = CASE WHEN $2::BIGINT IS NULL THEN 'cancelled' ELSE 'active' END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [transactionId, newAmount, newDescription],
    );
    await client.query('COMMIT');
    return { ...mapTransaction(result.rows[0]), action, amount_before: transaction.amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteTransaction({ userId, ledgerId, transactionId, reason = 'Hoàn tác giao dịch' }) {
  return adjustTransaction({ userId, ledgerId, transactionId, reason });
}

async function getSpendingBetween({ ledgerId, start, end, categoryId = null }) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
     FROM financial_transactions
     WHERE ledger_id = $1 AND transaction_type = 'expense'
       AND status = 'active'
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

  return {
  createTransaction,
  createTransactions,
  getMonthlySummary,
  getMonthlyTransactions,
  getDailySummary,
  getRecentTransactions,
  searchTransactions,
  getTransactionById,
  findRecentExpenseCandidates,
  adjustTransaction,
  deleteTransaction,
  getSpendingBetween,
  deleteAllUserData,
  };
}

module.exports = { createTransactionRepository };
