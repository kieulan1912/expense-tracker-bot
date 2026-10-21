const { Pool } = require('pg');

function createDatabase(config) {
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
      ADD COLUMN IF NOT EXISTS source_key VARCHAR(100),
      ADD COLUMN IF NOT EXISTS counterparty_name VARCHAR(80),
      ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'cancelled')),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);

  // Dữ liệu tạo trước khi có occurred_at nhận thời điểm deploy làm giá trị
  // mặc định. Với lệnh cũ, created_at mới là thời gian giao dịch chính xác.
  await pool.query(`
    UPDATE financial_transactions
    SET occurred_at = created_at
    WHERE source = 'command'
      AND source_key IS NULL
      AND occurred_at IS DISTINCT FROM created_at
  `);

  // Chuẩn hóa category dạng text của phiên bản cũ sang category_id. Điều này
  // ngăn cùng một danh mục xuất hiện thành hai dòng trong báo cáo.
  await pool.query(`
    UPDATE financial_transactions
    SET category_id = CASE
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
      ELSE category_id
    END
    WHERE category_id = 99 AND category <> 'Khác'
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
      reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      plan VARCHAR(12) NOT NULL DEFAULT 'free',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE user_preferences
      ALTER COLUMN reminders_enabled SET DEFAULT TRUE
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
      ADD COLUMN IF NOT EXISTS last_reminded_on DATE,
      ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT,
      ADD COLUMN IF NOT EXISTS cancelled_by_user_id BIGINT,
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(160)
  `);

  await pool.query(`
    UPDATE debts SET created_by_user_id = telegram_user_id
    WHERE created_by_user_id IS NULL
  `);
  await pool.query(`
    ALTER TABLE debts ALTER COLUMN created_by_user_id SET NOT NULL
  `);
  await pool.query('ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_status_check');
  await pool.query(`
    ALTER TABLE debts ADD CONSTRAINT debts_status_check
    CHECK (status IN ('open', 'paid', 'cancelled'))
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
      created_by_user_id BIGINT,
      source_key VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE debt_payments
      ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT,
      ADD COLUMN IF NOT EXISTS source_key VARCHAR(100)
  `);
  await pool.query(`
    UPDATE debt_payments p SET created_by_user_id = d.created_by_user_id
    FROM debts d WHERE p.debt_id = d.id AND p.created_by_user_id IS NULL
  `);
  await pool.query(`
    ALTER TABLE debt_payments ALTER COLUMN created_by_user_id SET NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_debt_payments_source
    ON debt_payments (debt_id, source_key) WHERE source_key IS NOT NULL
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

  await pool.query(`
    ALTER TABLE user_preferences
      ADD COLUMN IF NOT EXISTS display_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS username VARCHAR(64),
      ADD COLUMN IF NOT EXISTS active_ledger_id BIGINT
  `);

  // Một số database cũ có thể còn dữ liệu nghiệp vụ nhưng thiếu preference.
  // Tạo preference tối thiểu trước khi migrate sang ledger.
  await pool.query(`
    INSERT INTO user_preferences (telegram_user_id, chat_id, timezone)
    SELECT user_id, user_id, $1
    FROM (
      SELECT telegram_user_id AS user_id FROM financial_transactions
      UNION SELECT telegram_user_id FROM budgets
      UNION SELECT telegram_user_id FROM debts
      UNION SELECT telegram_user_id FROM recurring_transactions
    ) users
    ON CONFLICT (telegram_user_id) DO NOTHING
  `, [config.timezone]);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledgers (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      kind VARCHAR(12) NOT NULL DEFAULT 'shared'
        CHECK (kind IN ('personal', 'shared')),
      owner_user_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledgers_personal_owner
    ON ledgers (owner_user_id) WHERE kind = 'personal'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_members (
      ledger_id BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      telegram_user_id BIGINT NOT NULL,
      role VARCHAR(10) NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ledger_id, telegram_user_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ledger_members_user
    ON ledger_members (telegram_user_id, ledger_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_invitations (
      id BIGSERIAL PRIMARY KEY,
      ledger_id BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      code_hash CHAR(64) NOT NULL UNIQUE,
      code_hint VARCHAR(12) NOT NULL,
      created_by_user_id BIGINT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_join_requests (
      id BIGSERIAL PRIMARY KEY,
      invitation_id BIGINT NOT NULL REFERENCES ledger_invitations(id) ON DELETE CASCADE,
      ledger_id BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      requester_user_id BIGINT NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by_user_id BIGINT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (invitation_id, requester_user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      ledger_id BIGINT REFERENCES ledgers(id) ON DELETE SET NULL,
      actor_user_id BIGINT NOT NULL,
      action VARCHAR(40) NOT NULL,
      target_user_id BIGINT,
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tự động tạo sổ cá nhân cho user hiện hữu và giữ nguyên toàn bộ dữ liệu cũ.
  await pool.query(`
    INSERT INTO ledgers (name, kind, owner_user_id)
    SELECT LEFT(
      CASE WHEN COALESCE(NULLIF(display_name, ''), '') = ''
        THEN 'Sổ cá nhân'
        ELSE 'Sổ của ' || display_name
      END,
      80
    ), 'personal', telegram_user_id
    FROM user_preferences
    ON CONFLICT (owner_user_id) WHERE kind = 'personal' DO NOTHING
  `);

  await pool.query(`
    INSERT INTO ledger_members (ledger_id, telegram_user_id, role)
    SELECT id, owner_user_id, 'owner' FROM ledgers WHERE kind = 'personal'
    ON CONFLICT (ledger_id, telegram_user_id) DO UPDATE SET role = 'owner'
  `);

  await pool.query(`
    UPDATE user_preferences u
    SET active_ledger_id = l.id
    FROM ledgers l
    WHERE l.owner_user_id = u.telegram_user_id
      AND l.kind = 'personal'
      AND (u.active_ledger_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM ledger_members m
        WHERE m.ledger_id = u.active_ledger_id
          AND m.telegram_user_id = u.telegram_user_id
      ))
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE user_preferences
        ADD CONSTRAINT fk_user_preferences_active_ledger
        FOREIGN KEY (active_ledger_id) REFERENCES ledgers(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  for (const table of ['financial_transactions', 'budgets', 'debts', 'recurring_transactions']) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ledger_id BIGINT`);
    await pool.query(`
      UPDATE ${table} item
      SET ledger_id = l.id
      FROM ledgers l
      WHERE item.ledger_id IS NULL
        AND l.kind = 'personal'
        AND l.owner_user_id = item.telegram_user_id
    `);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN ledger_id SET NOT NULL`);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE ${table}
          ADD CONSTRAINT fk_${table}_ledger
          FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  await pool.query(`
    ALTER TABLE financial_transactions
      ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT
  `);
  await pool.query(`
    UPDATE financial_transactions
    SET created_by_user_id = telegram_user_id
    WHERE created_by_user_id IS NULL
  `);
  await pool.query(`
    ALTER TABLE financial_transactions
      ALTER COLUMN created_by_user_id SET NOT NULL
  `);

  // Chuyển uniqueness từ user sang ledger để một user có nhiều sổ độc lập.
  await pool.query(`
    ALTER TABLE budgets
      DROP CONSTRAINT IF EXISTS budgets_telegram_user_id_category_id_month_year_key
  `);
  await pool.query('DROP INDEX IF EXISTS idx_budgets_total_unique');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_ledger_category_unique
    ON budgets (ledger_id, category_id, month, year)
    WHERE category_id IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_ledger_total_unique
    ON budgets (ledger_id, month, year)
    WHERE category_id IS NULL
  `);

  await pool.query('DROP INDEX IF EXISTS idx_financial_transactions_source_key');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transactions_ledger_source
    ON financial_transactions (ledger_id, source_key)
    WHERE source_key IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_ledger_occurred
    ON financial_transactions (ledger_id, occurred_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debts_ledger_status
    ON debts (ledger_id, status, due_date)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_recurring_ledger_active
    ON recurring_transactions (ledger_id, active, day_of_month)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transaction_adjustments (
      id BIGSERIAL PRIMARY KEY,
      transaction_id BIGINT NOT NULL
        REFERENCES financial_transactions(id) ON DELETE CASCADE,
      ledger_id BIGINT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      actor_user_id BIGINT NOT NULL,
      action VARCHAR(12) NOT NULL CHECK (action IN ('adjust', 'cancel')),
      amount_before BIGINT NOT NULL CHECK (amount_before > 0),
      amount_after BIGINT CHECK (amount_after > 0),
      description_before TEXT NOT NULL,
      description_after TEXT,
      reason VARCHAR(160) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_transaction_adjustments_transaction
    ON transaction_adjustments (transaction_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    WITH applied AS (
      INSERT INTO app_migrations (migration_key)
      VALUES ('20261016_enable_reminders_by_default')
      ON CONFLICT (migration_key) DO NOTHING
      RETURNING migration_key
    )
    UPDATE user_preferences
    SET reminders_enabled = TRUE, updated_at = CURRENT_TIMESTAMP
    WHERE EXISTS (SELECT 1 FROM applied)
  `);

    await pool.query('SELECT NOW()');
  }

  return { pool, initializeDatabase };
}

module.exports = { createDatabase };
