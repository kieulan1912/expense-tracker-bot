function createFinanceRepository(pool) {

async function upsertBudget({ userId, ledgerId, categoryId, amount, month, year }) {
  const result = categoryId === null
    ? await pool.query(
      `INSERT INTO budgets (telegram_user_id, ledger_id, category_id, amount, month, year)
       VALUES ($1, $2, NULL, $3, $4, $5)
       ON CONFLICT (ledger_id, month, year) WHERE category_id IS NULL
       DO UPDATE SET amount = EXCLUDED.amount RETURNING *`,
      [userId, ledgerId, amount, month, year],
    )
    : await pool.query(
      `INSERT INTO budgets (telegram_user_id, ledger_id, category_id, amount, month, year)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ledger_id, category_id, month, year)
       WHERE category_id IS NOT NULL
       DO UPDATE SET amount = EXCLUDED.amount RETURNING *`,
      [userId, ledgerId, categoryId, amount, month, year],
    );
  return result.rows[0];
}

async function getBudgets({ ledgerId, month, year }) {
  const result = await pool.query(
    `SELECT * FROM budgets WHERE ledger_id = $1 AND month = $2 AND year = $3
     ORDER BY category_id NULLS FIRST`,
    [ledgerId, month, year],
  );
  return result.rows;
}

async function getBudgetStatus({ ledgerId, month, year, timezone }) {
  const result = await pool.query(
    `SELECT b.category_id, b.amount,
       COALESCE(SUM(t.amount), 0)::BIGINT AS spent
     FROM budgets b
     LEFT JOIN financial_transactions t
       ON t.ledger_id = b.ledger_id
      AND t.transaction_type = 'expense'
      AND EXTRACT(MONTH FROM t.occurred_at AT TIME ZONE $4) = b.month
      AND EXTRACT(YEAR FROM t.occurred_at AT TIME ZONE $4) = b.year
      AND (b.category_id IS NULL OR t.category_id = b.category_id)
     WHERE b.ledger_id = $1 AND b.month = $2 AND b.year = $3
     GROUP BY b.id ORDER BY b.category_id NULLS FIRST`,
    [ledgerId, month, year, timezone],
  );
  return result.rows;
}

async function createDebt({ userId, ledgerId, personName, debtType, amount, description = '', dueDate = null }) {
  const result = await pool.query(
    `INSERT INTO debts (telegram_user_id, ledger_id, person_name, debt_type,
       original_amount, remaining_amount, description, due_date)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7) RETURNING *`,
    [userId, ledgerId, personName, debtType, amount, description, dueDate],
  );
  return result.rows[0];
}

async function payDebt({ userId, ledgerId, debtId, amount }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT d.* FROM debts d
       WHERE d.id = $1 AND d.ledger_id = $2 AND d.status = 'open'
         AND EXISTS (
           SELECT 1 FROM ledger_members m
           WHERE m.ledger_id = d.ledger_id AND m.telegram_user_id = $3
             AND m.role IN ('owner', 'member')
         ) FOR UPDATE OF d`,
      [debtId, ledgerId, userId],
    );
    const debt = locked.rows[0];
    if (!debt) {
      await client.query('ROLLBACK');
      return null;
    }
    const payment = Math.min(amount, Number(debt.remaining_amount));
    const remaining = Number(debt.remaining_amount) - payment;
    await client.query(
      'INSERT INTO debt_payments (debt_id, amount) VALUES ($1, $2)',
      [debtId, payment],
    );
    const result = await client.query(
      `UPDATE debts SET remaining_amount = $2,
       status = CASE WHEN $2 = 0 THEN 'paid' ELSE 'open' END,
       updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [debtId, remaining],
    );
    await client.query('COMMIT');
    return { ...result.rows[0], payment };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getOpenDebts(ledgerId) {
  const result = await pool.query(
    `SELECT * FROM debts WHERE ledger_id = $1 AND status = 'open'
     ORDER BY due_date NULLS LAST, created_at DESC`,
    [ledgerId],
  );
  return result.rows;
}

async function createRecurring({ userId, ledgerId, type, amount, categoryId, description, dayOfMonth }) {
  const result = await pool.query(
    `INSERT INTO recurring_transactions
       (telegram_user_id, ledger_id, transaction_type, amount, category_id, description, day_of_month)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, ledgerId, type, amount, categoryId, description, dayOfMonth],
  );
  return result.rows[0];
}

async function getRecurring(ledgerId) {
  const result = await pool.query(
    `SELECT * FROM recurring_transactions
     WHERE ledger_id = $1 AND active = TRUE ORDER BY day_of_month, id`,
    [ledgerId],
  );
  return result.rows;
}

async function deleteRecurring({ userId, ledgerId, recurringId }) {
  const result = await pool.query(
    `DELETE FROM recurring_transactions r WHERE id = $1 AND ledger_id = $2
       AND EXISTS (
         SELECT 1 FROM ledger_members m
         WHERE m.ledger_id = r.ledger_id AND m.telegram_user_id = $3
           AND m.role IN ('owner', 'member')
       )
     RETURNING *`,
    [recurringId, ledgerId, userId],
  );
  return result.rows[0] || null;
}

async function getDueRecurring(dayOfMonth, date) {
  const result = await pool.query(
    `SELECT r.*, u.chat_id FROM recurring_transactions r
     JOIN user_preferences u ON u.telegram_user_id = r.telegram_user_id
     JOIN ledger_members m
       ON m.ledger_id = r.ledger_id
      AND m.telegram_user_id = r.telegram_user_id
      AND m.role IN ('owner', 'member')
     WHERE r.active = TRUE
       AND LEAST(
         r.day_of_month,
         EXTRACT(DAY FROM (date_trunc('month', $2::DATE) + INTERVAL '1 month - 1 day'))
       ) = $1
       AND (r.last_prompted_on IS NULL OR r.last_prompted_on < $2::DATE)`,
    [dayOfMonth, date],
  );
  return result.rows;
}

async function getExpenseStats(ledgerId) {
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count,
       COALESCE(AVG(amount), 0)::BIGINT AS average
     FROM financial_transactions
     WHERE ledger_id = $1 AND transaction_type = 'expense'
       AND occurred_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`,
    [ledgerId],
  );
  return { count: Number(result.rows[0].count), average: Number(result.rows[0].average) };
}

async function getDueDebts(date) {
  const result = await pool.query(
    `SELECT d.*, u.chat_id
     FROM debts d
     JOIN user_preferences u ON u.telegram_user_id = d.telegram_user_id
     JOIN ledger_members m
       ON m.ledger_id = d.ledger_id
      AND m.telegram_user_id = d.telegram_user_id
      AND m.role IN ('owner', 'member')
     WHERE d.status = 'open' AND d.due_date IS NOT NULL
       AND d.due_date <= $1::DATE + INTERVAL '3 days'
       AND (d.last_reminded_on IS NULL OR d.last_reminded_on < $1::DATE)`,
    [date],
  );
  return result.rows;
}

async function markDebtReminded(id, date) {
  await pool.query('UPDATE debts SET last_reminded_on = $2 WHERE id = $1', [id, date]);
}

async function markRecurringPrompted(id, date) {
  await pool.query(
    'UPDATE recurring_transactions SET last_prompted_on = $2 WHERE id = $1',
    [id, date],
  );
}

async function getRecurringById({ userId, recurringId }) {
  const result = await pool.query(
    `SELECT r.* FROM recurring_transactions r
     JOIN ledger_members m ON m.ledger_id = r.ledger_id
     WHERE r.id = $1 AND m.telegram_user_id = $2
       AND m.role IN ('owner', 'member') AND r.active = TRUE`,
    [recurringId, userId],
  );
  return result.rows[0] || null;
}

  return {
  upsertBudget,
  getBudgets,
  getBudgetStatus,
  createDebt,
  payDebt,
  getOpenDebts,
  createRecurring,
  getRecurring,
  deleteRecurring,
  getDueRecurring,
  markRecurringPrompted,
  getRecurringById,
  getExpenseStats,
  getDueDebts,
  markDebtReminded,
  };
}

module.exports = { createFinanceRepository };
