const { pool } = require('./database');
const { config } = require('./config');

async function ensureUser({ userId, chatId, displayName = null, username = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_preferences (
         telegram_user_id, chat_id, timezone, display_name, username
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         chat_id = EXCLUDED.chat_id,
         display_name = COALESCE(EXCLUDED.display_name, user_preferences.display_name),
         username = EXCLUDED.username,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, chatId, config.timezone, displayName, username],
    );
    const ledgerResult = await client.query(
      `INSERT INTO ledgers (name, kind, owner_user_id)
       VALUES ($1, 'personal', $2)
       ON CONFLICT (owner_user_id) WHERE kind = 'personal'
       DO UPDATE SET updated_at = ledgers.updated_at
       RETURNING id`,
      [`Sổ của ${displayName || userId}`.slice(0, 80), userId],
    );
    const ledgerId = ledgerResult.rows[0].id;
    await client.query(
      `INSERT INTO ledger_members (ledger_id, telegram_user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (ledger_id, telegram_user_id) DO UPDATE SET role = 'owner'`,
      [ledgerId, userId],
    );
    const result = await client.query(
      `UPDATE user_preferences
       SET active_ledger_id = COALESCE(active_ledger_id, $2)
       WHERE telegram_user_id = $1 RETURNING *`,
      [userId, ledgerId],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getUser(userId) {
  const result = await pool.query(
    'SELECT * FROM user_preferences WHERE telegram_user_id = $1',
    [userId],
  );
  return result.rows[0] || null;
}

async function updatePreference(userId, field, value) {
  const allowed = new Set(['personality', 'ocr_consent', 'reminders_enabled']);
  if (!allowed.has(field)) throw new Error('Preference không hợp lệ');
  const result = await pool.query(
    `UPDATE user_preferences SET ${field} = $2, updated_at = CURRENT_TIMESTAMP
     WHERE telegram_user_id = $1 RETURNING *`,
    [userId, value],
  );
  return result.rows[0];
}

async function getReminderUsers() {
  const result = await pool.query(
    `SELECT u.*, l.name AS active_ledger_name
     FROM user_preferences u
     LEFT JOIN ledgers l ON l.id = u.active_ledger_id
     WHERE u.reminders_enabled = TRUE`,
  );
  return result.rows;
}

module.exports = { ensureUser, getUser, updatePreference, getReminderUsers };
