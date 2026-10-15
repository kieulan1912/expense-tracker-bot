const { pool } = require('./database');
const { createInvitationCode, hashInvitationCode } = require('./utils/invitation');

const INVITATION_TTL_HOURS = 24;

async function hasSharedAccess(userId) {
  const result = await pool.query(
    `SELECT 1 FROM ledger_members m
     JOIN ledgers l ON l.id = m.ledger_id
     WHERE m.telegram_user_id = $1 AND l.kind = 'shared'
     LIMIT 1`,
    [userId],
  );
  return result.rowCount > 0;
}

async function getLedgerAccess(userId, ledgerId) {
  const result = await pool.query(
    `SELECT l.id, l.name, l.kind, l.owner_user_id, m.role
     FROM ledgers l
     JOIN ledger_members m ON m.ledger_id = l.id
     WHERE l.id = $1 AND m.telegram_user_id = $2`,
    [ledgerId, userId],
  );
  return result.rows[0] || null;
}

async function getActiveLedger(userId) {
  const result = await pool.query(
    `SELECT l.id, l.name, l.kind, l.owner_user_id, m.role
     FROM user_preferences u
     JOIN ledger_members m
       ON m.ledger_id = u.active_ledger_id
      AND m.telegram_user_id = u.telegram_user_id
     JOIN ledgers l ON l.id = m.ledger_id
     WHERE u.telegram_user_id = $1`,
    [userId],
  );
  if (result.rows[0]) return result.rows[0];

  const fallback = await pool.query(
    `SELECT l.id, l.name, l.kind, l.owner_user_id, m.role
     FROM ledgers l
     JOIN ledger_members m ON m.ledger_id = l.id
     WHERE m.telegram_user_id = $1
     ORDER BY (l.kind = 'personal') DESC, l.id
     LIMIT 1`,
    [userId],
  );
  if (!fallback.rows[0]) return null;
  await pool.query(
    'UPDATE user_preferences SET active_ledger_id = $2 WHERE telegram_user_id = $1',
    [userId, fallback.rows[0].id],
  );
  return fallback.rows[0];
}

async function listLedgers(userId) {
  const result = await pool.query(
    `SELECT l.id, l.name, l.kind, m.role,
       (u.active_ledger_id = l.id) AS is_active
     FROM ledger_members m
     JOIN ledgers l ON l.id = m.ledger_id
     JOIN user_preferences u ON u.telegram_user_id = m.telegram_user_id
     WHERE m.telegram_user_id = $1
     ORDER BY is_active DESC, l.kind = 'personal' DESC, l.name`,
    [userId],
  );
  return result.rows;
}

async function createLedger({ userId, name }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO ledgers (name, kind, owner_user_id)
       VALUES ($1, 'shared', $2) RETURNING *`,
      [name.slice(0, 80), userId],
    );
    const ledger = created.rows[0];
    await client.query(
      `INSERT INTO ledger_members (ledger_id, telegram_user_id, role)
       VALUES ($1, $2, 'owner')`,
      [ledger.id, userId],
    );
    await client.query(
      `UPDATE user_preferences SET active_ledger_id = $2,
       updated_at = CURRENT_TIMESTAMP WHERE telegram_user_id = $1`,
      [userId, ledger.id],
    );
    await client.query(
      `INSERT INTO ledger_audit_logs (ledger_id, actor_user_id, action)
       VALUES ($1, $2, 'ledger_created')`,
      [ledger.id, userId],
    );
    await client.query('COMMIT');
    return { ...ledger, role: 'owner' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function selectLedger({ userId, ledgerId }) {
  const result = await pool.query(
    `UPDATE user_preferences u SET active_ledger_id = $2,
       updated_at = CURRENT_TIMESTAMP
     WHERE u.telegram_user_id = $1
       AND EXISTS (
         SELECT 1 FROM ledger_members m
         WHERE m.ledger_id = $2 AND m.telegram_user_id = $1
       )
     RETURNING *`,
    [userId, ledgerId],
  );
  return result.rows[0] || null;
}

async function createInvitation({ userId, ledgerId }) {
  const code = createInvitationCode();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await client.query(
      `SELECT 1 FROM ledger_members
       WHERE ledger_id = $1 AND telegram_user_id = $2 AND role = 'owner'`,
      [ledgerId, userId],
    );
    if (!access.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE ledger_invitations SET revoked_at = CURRENT_TIMESTAMP
       WHERE ledger_id = $1 AND used_at IS NULL AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`,
      [ledgerId],
    );
    await client.query(
      `INSERT INTO ledger_invitations (
         ledger_id, code_hash, code_hint, created_by_user_id, expires_at
       ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5::TEXT || ' hours')::INTERVAL)`,
      [ledgerId, hashInvitationCode(code), code.slice(-4), userId, String(INVITATION_TTL_HOURS)],
    );
    await client.query(
      `INSERT INTO ledger_audit_logs (ledger_id, actor_user_id, action)
       VALUES ($1, $2, 'invitation_created')`,
      [ledgerId, userId],
    );
    await client.query('COMMIT');
    return { code, expiresInHours: INVITATION_TTL_HOURS };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function requestJoin({ userId, code }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invitationResult = await client.query(
      `SELECT i.*, l.name, l.owner_user_id, u.chat_id AS owner_chat_id
       FROM ledger_invitations i
       JOIN ledgers l ON l.id = i.ledger_id
       JOIN user_preferences u ON u.telegram_user_id = l.owner_user_id
       WHERE i.code_hash = $1 AND i.used_at IS NULL AND i.revoked_at IS NULL
         AND i.expires_at > CURRENT_TIMESTAMP
       FOR UPDATE OF i`,
      [hashInvitationCode(code)],
    );
    const invitation = invitationResult.rows[0];
    if (!invitation) {
      await client.query('ROLLBACK');
      return { status: 'invalid' };
    }
    const membership = await client.query(
      `SELECT 1 FROM ledger_members
       WHERE ledger_id = $1 AND telegram_user_id = $2`,
      [invitation.ledger_id, userId],
    );
    if (membership.rowCount) {
      await client.query('ROLLBACK');
      return { status: 'member', ledgerId: invitation.ledger_id };
    }
    await client.query(
      'UPDATE ledger_invitations SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [invitation.id],
    );
    const created = await client.query(
      `INSERT INTO ledger_join_requests (
         invitation_id, ledger_id, requester_user_id
       ) VALUES ($1, $2, $3)
       RETURNING id`,
      [invitation.id, invitation.ledger_id, userId],
    );
    await client.query('COMMIT');
    return {
      status: 'pending',
      requestId: created.rows[0].id,
      ledgerId: invitation.ledger_id,
      ledgerName: invitation.name,
      ownerUserId: invitation.owner_user_id,
      ownerChatId: invitation.owner_chat_id,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function reviewJoinRequest({ ownerUserId, requestId, approve }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT r.*, l.name, u.chat_id AS requester_chat_id,
         COALESCE(u.display_name, u.username, r.requester_user_id::TEXT) AS requester_name
       FROM ledger_join_requests r
       JOIN ledgers l ON l.id = r.ledger_id
       JOIN user_preferences u ON u.telegram_user_id = r.requester_user_id
       JOIN ledger_members owner
         ON owner.ledger_id = r.ledger_id
        AND owner.telegram_user_id = $2
        AND owner.role = 'owner'
       WHERE r.id = $1 AND r.status = 'pending'
       FOR UPDATE OF r`,
      [requestId, ownerUserId],
    );
    const request = found.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return null;
    }
    const status = approve ? 'approved' : 'rejected';
    await client.query(
      `UPDATE ledger_join_requests SET status = $2,
       reviewed_by_user_id = $3, reviewed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [requestId, status, ownerUserId],
    );
    if (approve) {
      await client.query(
        `INSERT INTO ledger_members (ledger_id, telegram_user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (ledger_id, telegram_user_id) DO NOTHING`,
        [request.ledger_id, request.requester_user_id],
      );
    }
    await client.query(
      `INSERT INTO ledger_audit_logs (
         ledger_id, actor_user_id, action, target_user_id
       ) VALUES ($1, $2, $3, $4)`,
      [request.ledger_id, ownerUserId, approve ? 'member_approved' : 'member_rejected', request.requester_user_id],
    );
    await client.query('COMMIT');
    return { ...request, status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listMembers({ userId, ledgerId }) {
  const result = await pool.query(
    `SELECT m.telegram_user_id, m.role, m.joined_at,
       COALESCE(u.display_name, NULLIF(u.username, ''), m.telegram_user_id::TEXT) AS display_name,
       u.username
     FROM ledger_members m
     JOIN ledger_members requester
       ON requester.ledger_id = m.ledger_id AND requester.telegram_user_id = $2
     LEFT JOIN user_preferences u ON u.telegram_user_id = m.telegram_user_id
     WHERE m.ledger_id = $1
     ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
       m.joined_at`,
    [ledgerId, userId],
  );
  return result.rows;
}

async function changeMemberRole({ ownerUserId, ledgerId, targetUserId, role }) {
  if (!['member', 'viewer'].includes(role)) return null;
  const result = await pool.query(
    `UPDATE ledger_members target SET role = $4
     WHERE target.ledger_id = $1 AND target.telegram_user_id = $3
       AND target.role <> 'owner'
       AND EXISTS (
         SELECT 1 FROM ledger_members owner
         WHERE owner.ledger_id = $1 AND owner.telegram_user_id = $2
           AND owner.role = 'owner'
       )
     RETURNING *`,
    [ledgerId, ownerUserId, targetUserId, role],
  );
  if (result.rows[0]) {
    await pool.query(
      `INSERT INTO ledger_audit_logs (
         ledger_id, actor_user_id, action, target_user_id, metadata
       ) VALUES ($1, $2, 'member_role_changed', $3, $4::JSONB)`,
      [ledgerId, ownerUserId, targetUserId, JSON.stringify({ role })],
    );
  }
  return result.rows[0] || null;
}

async function removeMember({ ownerUserId, ledgerId, targetUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `DELETE FROM ledger_members target
       WHERE target.ledger_id = $1 AND target.telegram_user_id = $3
         AND target.role <> 'owner'
         AND EXISTS (
           SELECT 1 FROM ledger_members owner
           WHERE owner.ledger_id = $1 AND owner.telegram_user_id = $2
             AND owner.role = 'owner'
         ) RETURNING *`,
      [ledgerId, ownerUserId, targetUserId],
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE user_preferences u SET active_ledger_id = personal.id
       FROM ledgers personal
       WHERE u.telegram_user_id = $1
         AND u.active_ledger_id = $2
         AND personal.owner_user_id = u.telegram_user_id
         AND personal.kind = 'personal'`,
      [targetUserId, ledgerId],
    );
    await client.query(
      `INSERT INTO ledger_audit_logs (
         ledger_id, actor_user_id, action, target_user_id
       ) VALUES ($1, $2, 'member_removed', $3)`,
      [ledgerId, ownerUserId, targetUserId],
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

async function leaveLedger({ userId, ledgerId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query(
      `DELETE FROM ledger_members
       WHERE ledger_id = $1 AND telegram_user_id = $2 AND role <> 'owner'
       RETURNING *`,
      [ledgerId, userId],
    );
    if (!removed.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE user_preferences u SET active_ledger_id = personal.id
       FROM ledgers personal
       WHERE u.telegram_user_id = $1
         AND personal.owner_user_id = u.telegram_user_id
         AND personal.kind = 'personal'`,
      [userId],
    );
    await client.query(
      `INSERT INTO ledger_audit_logs (
         ledger_id, actor_user_id, action, target_user_id
       ) VALUES ($1, $2, 'member_left', $2)`,
      [ledgerId, userId],
    );
    await client.query('COMMIT');
    return removed.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteLedger({ ownerUserId, ledgerId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ledger = await client.query(
      `SELECT l.* FROM ledgers l
       JOIN ledger_members m ON m.ledger_id = l.id
       WHERE l.id = $1 AND l.kind = 'shared'
         AND m.telegram_user_id = $2 AND m.role = 'owner'
       FOR UPDATE OF l`,
      [ledgerId, ownerUserId],
    );
    if (!ledger.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE user_preferences u SET active_ledger_id = personal.id
       FROM ledgers personal
       WHERE u.active_ledger_id = $1
         AND personal.owner_user_id = u.telegram_user_id
         AND personal.kind = 'personal'`,
      [ledgerId],
    );
    await client.query(
      `INSERT INTO ledger_audit_logs (
         ledger_id, actor_user_id, action, metadata
       ) VALUES ($1, $2, 'ledger_deleted', $3::JSONB)`,
      [ledgerId, ownerUserId, JSON.stringify({ name: ledger.rows[0].name })],
    );
    await client.query('DELETE FROM ledgers WHERE id = $1', [ledgerId]);
    await client.query('COMMIT');
    return ledger.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  hasSharedAccess,
  getLedgerAccess,
  getActiveLedger,
  listLedgers,
  createLedger,
  selectLedger,
  createInvitation,
  requestJoin,
  reviewJoinRequest,
  listMembers,
  changeMemberRole,
  removeMember,
  leaveLedger,
  deleteLedger,
};
