const { config } = require('../../config');
const { InputError } = require('../../errors');
const { ensureUser, getUser } = require('../../user_repository');
const { hasSharedAccess, getActiveLedger } = require('../../ledger_repository');
const { canWriteLedger, canManageLedger } = require('../../domain/ledger_policy');

function telegramDisplayName(from) {
  return [from.first_name, from.last_name].filter(Boolean).join(' ')
    || from.username
    || String(from.id);
}

function createContextMiddleware() {
  const initializedUsers = new Set();
  const rateWindows = new Map();

  const middleware = async (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;

    if (config.allowedUserIds.size > 0 && !config.allowedUserIds.has(userId)) {
      const text = ctx.message?.text || '';
      const mayRequestAccess = /^\/thamgia(?:@\w+)?(?:\s|$)/i.test(text);
      if (!mayRequestAccess && !(await hasSharedAccess(userId))) {
        await ctx.reply(
          '⛔ Bạn chưa có quyền sử dụng bot. Nếu có mã mời, hãy gửi /thamgia MA_MOI.',
        );
        return;
      }
    }

    const now = Date.now();
    const current = rateWindows.get(userId);
    const window = !current || now - current.startedAt >= 60_000
      ? { startedAt: now, count: 0 }
      : current;
    window.count += 1;
    rateWindows.set(userId, window);
    if (window.count > config.botRateLimitPerMinute) {
      if (window.count === config.botRateLimitPerMinute + 1) {
        await ctx.reply('⏳ Bạn thao tác hơi nhanh. Vui lòng chờ khoảng một phút.');
      }
      return;
    }

    if (!initializedUsers.has(userId)) {
      await ensureUser({
        userId,
        chatId: ctx.chat?.id || ctx.from.id,
        displayName: telegramDisplayName(ctx.from),
        username: ctx.from.username || null,
      });
      initializedUsers.add(userId);
    }

    ctx.state.ledger = await getActiveLedger(userId);
    if (!ctx.state.ledger) {
      initializedUsers.delete(userId);
      throw new Error('Không thể khởi tạo sổ cá nhân');
    }
    await next();
  };

  return {
    middleware,
    forgetUser: (userId) => initializedUsers.delete(String(userId)),
  };
}

async function notifyUser(ctx, userId, text) {
  const user = await getUser(userId);
  if (!user?.chat_id) return;
  await ctx.telegram.sendMessage(user.chat_id, text).catch((error) => {
    console.error('Không thể gửi thông báo thành viên:', error.message);
  });
}

function requireWritableLedger(ctx) {
  if (!canWriteLedger(ctx.state.ledger.role)) {
    throw new InputError(
      'Bạn đang có quyền Người xem. Hãy liên hệ chủ sổ để được cấp quyền Thành viên.',
    );
  }
  return ctx.state.ledger;
}

function requireOwnerLedger(ctx) {
  if (!canManageLedger(ctx.state.ledger.role)) {
    throw new InputError('Chỉ chủ sổ mới có quyền thực hiện thao tác này.');
  }
  return ctx.state.ledger;
}

module.exports = {
  createContextMiddleware,
  telegramDisplayName,
  notifyUser,
  requireWritableLedger,
  requireOwnerLedger,
};
