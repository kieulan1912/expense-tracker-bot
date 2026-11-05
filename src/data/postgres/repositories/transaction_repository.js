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

function descriptionsAreSimilar(left, right) {
  const normalizedLeft = normalizeForCategory(left);
  const normalizedRight = normalizeForCategory(right);
  if (normalizedLeft === normalizedRight) return true;
  const leftTokens = new Set(normalizedLeft.split(' ').filter(Boolean));
  const rightTokens = new Set(normalizedRight.split(' ').filter(Boolean));
  if (Math.min(leftTokens.size, rightTokens.size) < 2) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 && intersection / union >= 0.65;
}

function isChildExpense(description) {
  const original = String(description || '').toLocaleLowerCase('vi');
  if (/\b(sữa|bỉm|tã|ăn dặm|mầm non|nhà trẻ|nhi khoa|khám nhi|đồ chơi)\b/iu.test(original)) {
    return true;
  }
  const normalized = normalizeForCategory(original);
  return [
    'cho con', 'cua con', 'con nho', 'em be', 'tre em', 'cho be', 'cua be',
    'hoc phi be', 'tien hoc con', 'quan ao tre', 'tiem cho be', 'thuoc cho be',
    'bot an dam', 'do dung cho be', 'do choi', 'mam non', 'nha tre', 'kham nhi',
    'sua cho be', 'sua bot', 'bim cho be', 'bim',
  ].some((keyword) => ` ${normalized} `.includes(` ${keyword} `));
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

async function findRecentDuplicates({ ledgerId, items, windowMinutes = 30 }) {
  if (!items?.length) return [];
  const result = await pool.query(
    `SELECT id, transaction_type, amount, category_id, description, occurred_at
     FROM financial_transactions
     WHERE ledger_id = $1 AND status = 'active'
       AND created_at >= CURRENT_TIMESTAMP - ($2::INTEGER * INTERVAL '1 minute')
     ORDER BY created_at DESC LIMIT 100`,
    [ledgerId, windowMinutes],
  );
  return items.flatMap((item, itemIndex) => {
    const duplicate = result.rows.find((row) =>
      row.transaction_type === item.type
      && Number(row.amount) === Number(item.amount)
      && descriptionsAreSimilar(row.description, item.description));
    return duplicate ? [{ itemIndex, item, transaction: mapTransaction(duplicate) }] : [];
  });
}

async function detectRecurringCandidate({ ledgerId, transactionId }) {
  const currentResult = await pool.query(
    `SELECT * FROM financial_transactions
     WHERE id = $1 AND ledger_id = $2 AND status = 'active'`,
    [transactionId, ledgerId],
  );
  const current = currentResult.rows[0];
  if (!current || current.source === 'recurring') return null;
  const existing = await pool.query(
    `SELECT id FROM recurring_transactions
     WHERE ledger_id = $1 AND active = TRUE AND transaction_type = $2
       AND amount = $3 AND category_id = $4`,
    [ledgerId, current.transaction_type, current.amount, current.category_id],
  );
  const normalized = normalizeForCategory(current.description);
  if (existing.rows.length) {
    const recurringDescriptions = await pool.query(
      `SELECT description FROM recurring_transactions
       WHERE ledger_id = $1 AND active = TRUE AND transaction_type = $2
         AND amount = $3 AND category_id = $4`,
      [ledgerId, current.transaction_type, current.amount, current.category_id],
    );
    if (recurringDescriptions.rows.some((row) =>
      normalizeForCategory(row.description) === normalized)) return null;
  }
  const history = await pool.query(
    `SELECT id, occurred_at, description,
       EXTRACT(DAY FROM occurred_at)::INTEGER AS day_of_month,
       TO_CHAR(occurred_at, 'YYYY-MM') AS period
     FROM financial_transactions
     WHERE ledger_id = $1 AND status = 'active' AND transaction_type = $2
       AND amount = $3 AND category_id = $4
       AND occurred_at >= CURRENT_TIMESTAMP - INTERVAL '14 months'
     ORDER BY occurred_at DESC LIMIT 40`,
    [ledgerId, current.transaction_type, current.amount, current.category_id],
  );
  const matching = history.rows.filter((row) =>
    normalizeForCategory(row.description) === normalized);
  const periods = new Set(matching.map((row) => row.period));
  if (periods.size < 3) return null;
  const periodIndexes = [...periods]
    .map((period) => {
      const [year, month] = period.split('-').map(Number);
      return year * 12 + month;
    })
    .sort((a, b) => b - a);
  if (periodIndexes[0] - periodIndexes[1] !== 1
    || periodIndexes[1] - periodIndexes[2] !== 1) return null;
  const days = matching.map((row) => Number(row.day_of_month));
  if (Math.max(...days) - Math.min(...days) > 5) return null;
  const sorted = [...days].sort((a, b) => a - b);
  return {
    transactionId: Number(current.id),
    type: current.transaction_type,
    amount: Number(current.amount),
    categoryId: Number(current.category_id),
    description: current.description,
    dayOfMonth: sorted[Math.floor(sorted.length / 2)],
    occurrences: periods.size,
  };
}

async function getWeeklyInsights({ ledgerId, date, timezone }) {
  const result = await pool.query(
    `WITH bounds AS (
       SELECT date_trunc('week', $2::DATE::TIMESTAMP) AS current_start
     ), scoped AS (
       SELECT t.*, (t.occurred_at AT TIME ZONE $3) AS local_time
       FROM financial_transactions t
       WHERE t.ledger_id = $1 AND t.status = 'active'
     ), weekly AS (
       SELECT CASE
         WHEN local_time >= b.current_start AND local_time < b.current_start + INTERVAL '7 days' THEN 'current'
         WHEN local_time >= b.current_start - INTERVAL '7 days' AND local_time < b.current_start THEN 'previous'
       END AS period, transaction_type, amount, category_id, category, description, local_time
       FROM scoped CROSS JOIN bounds b
       WHERE local_time >= b.current_start - INTERVAL '7 days'
         AND local_time < b.current_start + INTERVAL '7 days'
     )
     SELECT period, transaction_type, category_id, MAX(category) AS category,
       SUM(amount)::BIGINT AS total, COUNT(*)::INTEGER AS count
     FROM weekly WHERE period IS NOT NULL
     GROUP BY period, transaction_type, category_id
     ORDER BY period, transaction_type, total DESC`,
    [ledgerId, date, timezone],
  );
  const largest = await pool.query(
    `SELECT id, amount, description, category_id, category
     FROM financial_transactions
     WHERE ledger_id = $1 AND status = 'active' AND transaction_type = 'expense'
       AND (occurred_at AT TIME ZONE $3) >= date_trunc('week', $2::DATE::TIMESTAMP)
       AND (occurred_at AT TIME ZONE $3) < date_trunc('week', $2::DATE::TIMESTAMP) + INTERVAL '7 days'
     ORDER BY amount DESC LIMIT 1`,
    [ledgerId, date, timezone],
  );
  const month = await pool.query(
    `SELECT transaction_type, COALESCE(SUM(amount), 0)::BIGINT AS total
     FROM financial_transactions
     WHERE ledger_id = $1 AND status = 'active'
       AND date_trunc('month', occurred_at AT TIME ZONE $3) = date_trunc('month', $2::DATE::TIMESTAMP)
       AND (occurred_at AT TIME ZONE $3)::DATE <= $2::DATE
     GROUP BY transaction_type`,
    [ledgerId, date, timezone],
  );
  return { rows: result.rows, largest: mapTransaction(largest.rows[0]), month: month.rows };
}

async function getSpendingInsights({ ledgerId, month, year, timezone, scope = 'all' }) {
  const previous = month === 1
    ? { month: 12, year: year - 1 }
    : { month: month - 1, year };
  const result = await pool.query(
    `SELECT id, amount, category_id, category, description,
       EXTRACT(MONTH FROM occurred_at AT TIME ZONE $6)::INTEGER AS local_month,
       EXTRACT(YEAR FROM occurred_at AT TIME ZONE $6)::INTEGER AS local_year,
       TO_CHAR(occurred_at AT TIME ZONE $6, 'DD/MM/YYYY') AS local_date
     FROM financial_transactions
     WHERE ledger_id = $1 AND status = 'active' AND transaction_type = 'expense'
       AND (
         (EXTRACT(MONTH FROM occurred_at AT TIME ZONE $6) = $2
          AND EXTRACT(YEAR FROM occurred_at AT TIME ZONE $6) = $3)
         OR
         (EXTRACT(MONTH FROM occurred_at AT TIME ZONE $6) = $4
          AND EXTRACT(YEAR FROM occurred_at AT TIME ZONE $6) = $5)
       )
     ORDER BY occurred_at DESC LIMIT 3000`,
    [ledgerId, month, year, previous.month, previous.year, timezone],
  );
  const scoped = scope === 'child'
    ? result.rows.filter((row) => isChildExpense(row.description))
    : result.rows;
  const currentRows = scoped.filter((row) =>
    Number(row.local_month) === month && Number(row.local_year) === year);
  const previousRows = scoped.filter((row) =>
    Number(row.local_month) === previous.month && Number(row.local_year) === previous.year);
  const sum = (rows) => rows.reduce((total, row) => total + Number(row.amount), 0);
  const categoryTotals = (rows) => {
    const totals = new Map();
    for (const row of rows) {
      const categoryId = Number(row.category_id);
      totals.set(categoryId, (totals.get(categoryId) || 0) + Number(row.amount));
    }
    return totals;
  };
  const currentCategories = categoryTotals(currentRows);
  const previousCategories = categoryTotals(previousRows);
  const categories = [...currentCategories.entries()]
    .map(([categoryId, total]) => ({
      categoryId,
      category: getCategoryName(categoryId, 'expense'),
      total,
      previousTotal: previousCategories.get(categoryId) || 0,
      change: total - (previousCategories.get(categoryId) || 0),
    }))
    .sort((left, right) => right.total - left.total);
  const currentTotal = sum(currentRows);
  const previousTotal = sum(previousRows);
  const average = currentRows.length ? Math.round(currentTotal / currentRows.length) : 0;
  const topTransactions = [...currentRows]
    .sort((left, right) => Number(right.amount) - Number(left.amount))
    .slice(0, 5)
    .map((row) => ({
      id: Number(row.id), amount: Number(row.amount),
      description: String(row.description).slice(0, 80),
      category: getCategoryName(row.category_id, 'expense'),
      date: row.local_date,
    }));
  const largestThreshold = average > 0 ? average * 2 : Infinity;
  return {
    scope,
    period: { month, year },
    previousPeriod: previous,
    total: currentTotal,
    previousTotal,
    change: currentTotal - previousTotal,
    changePercent: previousTotal > 0
      ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10
      : null,
    transactionCount: currentRows.length,
    previousTransactionCount: previousRows.length,
    average,
    categories: categories.slice(0, 7),
    topTransactions,
    unusualTransactions: topTransactions.filter((row) => row.amount >= largestThreshold),
    matchedByDescription: scope === 'child',
  };
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
  findRecentDuplicates,
  detectRecurringCandidate,
  getWeeklyInsights,
  getSpendingInsights,
  adjustTransaction,
  deleteTransaction,
  getSpendingBetween,
  deleteAllUserData,
  };
}

module.exports = { createTransactionRepository };
