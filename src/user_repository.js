const { pool } = require('./database');
const { config } = require('./config');

async function ensureUser({ userId, chatId }) {
  const result = await pool.query(
    `INSERT INTO user_preferences (telegram_user_id, chat_id, timezone)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_user_id) DO UPDATE
       SET chat_id = EXCLUDED.chat_id, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, chatId, config.timezone],
  );
  return result.rows[0];
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
    'SELECT * FROM user_preferences WHERE reminders_enabled = TRUE',
  );
  return result.rows;
}

module.exports = { ensureUser, getUser, updatePreference, getReminderUsers };
