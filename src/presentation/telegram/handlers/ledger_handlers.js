const { Markup } = require('telegraf');
const { InputError } = require('../../../errors');
const { getCommandArguments, parsePositiveInteger } = require('../../../utils/command');
const {
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
} = require('../../../ledger_repository');
const { roleLabel } = require('../../../domain/ledger_policy');
const { notifyUser, telegramDisplayName, requireOwnerLedger } = require('../context');
const { showLedgerMenu } = require('../views');

function createInputModeStore() {
  const modes = new Map();
  return {
    set(userId, kind) {
      modes.set(String(userId), { kind, expiresAt: Date.now() + 10 * 60 * 1000 });
    },
    get(userId) {
      const key = String(userId);
      const mode = modes.get(key);
      if (!mode || mode.expiresAt < Date.now()) {
        modes.delete(key);
        return null;
      }
      return mode.kind;
    },
    clear(userId) {
      modes.delete(String(userId));
    },
  };
}

function registerLedgerHandlers(bot) {
  const inputModes = createInputModeStore();

  async function sendLedgerList(ctx) {
    const ledgers = await listLedgers(ctx.from.id);
    const buttons = ledgers.map((ledger) => [Markup.button.callback(
      `${ledger.is_active ? '●' : '○'} ${ledger.name} · ${roleLabel(ledger.role)}`,
      `ledger:select:${ledger.id}`,
    )]);
    buttons.push([Markup.button.callback('⬅️ Sổ chung', 'menu:ledgers')]);
    return ctx.reply('📚 Chọn sổ muốn sử dụng:', Markup.inlineKeyboard(buttons));
  }

  async function sendMembers(ctx) {
    const members = await listMembers({
      userId: ctx.from.id,
      ledgerId: ctx.state.ledger.id,
    });
    const lines = ['👥 THÀNH VIÊN', '', ...members.map((member) => {
      const icon = member.role === 'owner' ? '👑' : member.role === 'member' ? '👤' : '👁';
      return `${icon} ${member.display_name} · ${roleLabel(member.role)}`;
    })];
    const buttons = ctx.state.ledger.role === 'owner'
      ? members.filter((member) => member.role !== 'owner').flatMap((member) => [
        [Markup.button.callback(
          `${member.role === 'member' ? 'Đổi thành Người xem' : 'Đổi thành Thành viên'} · ${member.display_name}`,
          `member:role:${ctx.state.ledger.id}:${member.telegram_user_id}:${member.role === 'member' ? 'viewer' : 'member'}`,
        )],
        [Markup.button.callback(
          `Xóa khỏi sổ · ${member.display_name}`,
          `member:removeask:${ctx.state.ledger.id}:${member.telegram_user_id}`,
        )],
      ])
      : [];
    buttons.push([Markup.button.callback('⬅️ Sổ chung', 'menu:ledgers')]);
    return ctx.reply(lines.join('\n'), Markup.inlineKeyboard(buttons));
  }

  async function handleCreateLedger(ctx, rawName) {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 80) {
      throw new InputError('Tên sổ cần từ 2 đến 80 ký tự.');
    }
    const ledger = await createLedger({ userId: ctx.from.id, name });
    ctx.state.ledger = ledger;
    return ctx.reply(
      `✅ Đã tạo và chuyển sang sổ “${ledger.name}”. Bạn là Chủ sổ.`,
      Markup.inlineKeyboard([[
        Markup.button.callback('✉️ Tạo mã mời', 'ledger:invite'),
        Markup.button.callback('📒 Mở menu', 'menu:main'),
      ]]),
    );
  }

  async function handleJoinLedger(ctx, rawCode) {
    const code = rawCode.trim().toUpperCase();
    if (!/^GD-[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      throw new InputError('Mã mời không đúng định dạng, ví dụ GD-A7K92P4X.');
    }
    const result = await requestJoin({ userId: ctx.from.id, code });
    if (result.status === 'invalid') {
      throw new InputError('Mã mời không hợp lệ, đã dùng hoặc đã hết hạn.');
    }
    if (result.status === 'member') return ctx.reply('✅ Bạn đã là thành viên của sổ này.');
    await ctx.telegram.sendMessage(result.ownerChatId, [
      '👤 YÊU CẦU THAM GIA SỔ', '',
      `${telegramDisplayName(ctx.from)} muốn tham gia “${result.ledgerName}”.`,
    ].join('\n'), Markup.inlineKeyboard([[
      Markup.button.callback('✅ Chấp nhận', `join:approve:${result.requestId}`),
      Markup.button.callback('❌ Từ chối', `join:reject:${result.requestId}`),
    ]]));
    return ctx.reply(`⏳ Đã gửi yêu cầu tham gia “${result.ledgerName}” tới chủ sổ.`);
  }

  bot.command('taoso', async (ctx) => {
    const name = getCommandArguments(ctx.message.text, 'taoso');
    if (name) return handleCreateLedger(ctx, name);
    inputModes.set(ctx.from.id, 'create_ledger');
    return ctx.reply('✍️ Hãy gửi tên sổ mới, ví dụ: Gia đình Lân & Thu.\nGửi /cancel để hủy.');
  });
  bot.command('moi', async (ctx) => {
    const ledger = requireOwnerLedger(ctx);
    if (ledger.kind !== 'shared') {
      throw new InputError('Sổ cá nhân không thể mời thành viên. Hãy tạo một sổ chung trước.');
    }
    const invitation = await createInvitation({ userId: ctx.from.id, ledgerId: ledger.id });
    return ctx.reply(`🔑 Mã mời: ${invitation.code}\n\nMã dùng một lần và hết hạn sau ${invitation.expiresInHours} giờ. Người nhập mã vẫn cần bạn phê duyệt.`);
  });
  bot.command('thamgia', async (ctx) => {
    const code = getCommandArguments(ctx.message.text, 'thamgia');
    if (code) return handleJoinLedger(ctx, code);
    inputModes.set(ctx.from.id, 'join_ledger');
    return ctx.reply('🔑 Hãy gửi mã mời, ví dụ GD-A7K92P4X.\nGửi /cancel để hủy.');
  });
  bot.command('danhsachso', sendLedgerList);
  bot.command('chonso', async (ctx) => {
    const ledgerId = parsePositiveInteger(
      getCommandArguments(ctx.message.text, 'chonso'),
      'Mã sổ',
    );
    const selected = await selectLedger({ userId: ctx.from.id, ledgerId });
    if (!selected) throw new InputError('Không tìm thấy sổ hoặc bạn không còn quyền truy cập.');
    const ledger = await getActiveLedger(ctx.from.id);
    ctx.state.ledger = ledger;
    return ctx.reply(`✅ Đã chuyển sang sổ “${ledger.name}”.`);
  });
  bot.command('thanhvien', sendMembers);
  bot.command('phanquyen', async (ctx) => {
    const ledger = requireOwnerLedger(ctx);
    const [target, role] = getCommandArguments(ctx.message.text, 'phanquyen').split(/\s+/);
    if (!/^\d+$/.test(target || '') || !['member', 'viewer'].includes(role)) {
      throw new InputError('Dùng /phanquyen TELEGRAM_ID member hoặc viewer.');
    }
    const changed = await changeMemberRole({
      ownerUserId: ctx.from.id,
      ledgerId: ledger.id,
      targetUserId: target,
      role,
    });
    if (changed) {
      await notifyUser(ctx, target, `🔐 Quyền của bạn trong “${ledger.name}” đã đổi thành ${roleLabel(role)}.`);
    }
    return ctx.reply(changed ? `✅ Đã đổi quyền thành ${roleLabel(role)}.` : '❌ Không thể đổi quyền thành viên này.');
  });
  bot.command('xoathanhvien', async (ctx) => {
    const ledger = requireOwnerLedger(ctx);
    const target = getCommandArguments(ctx.message.text, 'xoathanhvien');
    if (!/^\d+$/.test(target)) throw new InputError('Dùng /xoathanhvien TELEGRAM_ID.');
    const removed = await removeMember({
      ownerUserId: ctx.from.id,
      ledgerId: ledger.id,
      targetUserId: target,
    });
    if (removed) {
      await notifyUser(ctx, target, `Bạn đã bị xóa khỏi sổ “${ledger.name}”. Dữ liệu cũ vẫn được giữ lại.`);
    }
    return ctx.reply(removed ? '✅ Đã xóa thành viên khỏi sổ. Dữ liệu cũ vẫn được giữ lại.' : '❌ Không thể xóa thành viên này.');
  });
  bot.command('roiso', async (ctx) => {
    if (ctx.state.ledger.kind !== 'shared') throw new InputError('Bạn không thể rời sổ cá nhân.');
    if (ctx.state.ledger.role === 'owner') {
      throw new InputError('Chủ sổ không thể rời sổ. Bạn có thể dùng /xoaso.');
    }
    return ctx.reply(`Rời sổ “${ctx.state.ledger.name}”? Dữ liệu bạn đã ghi vẫn được giữ lại.`, Markup.inlineKeyboard([[
      Markup.button.callback('🚪 Xác nhận rời', `ledger:leaveconfirm:${ctx.state.ledger.id}`),
      Markup.button.callback('Hủy', 'menu:ledgers'),
    ]]));
  });
  bot.command('xoaso', async (ctx) => {
    const ledger = requireOwnerLedger(ctx);
    if (ledger.kind !== 'shared') {
      throw new InputError('Không thể xóa sổ cá nhân. Dùng /deletedata nếu muốn xóa tài khoản.');
    }
    return ctx.reply(`⚠️ Xóa vĩnh viễn sổ “${ledger.name}” cùng toàn bộ dữ liệu?`, Markup.inlineKeyboard([[
      Markup.button.callback('🗑 Xóa vĩnh viễn', `ledger:deleteconfirm:${ledger.id}`),
      Markup.button.callback('Hủy', 'menu:ledgers'),
    ]]));
  });
  bot.command('cancel', (ctx) => {
    inputModes.clear(ctx.from.id);
    return ctx.reply('✅ Đã hủy thao tác đang nhập.');
  });

  bot.action('menu:ledgers', async (ctx) => {
    await ctx.answerCbQuery();
    return showLedgerMenu(ctx);
  });
  bot.action('ledger:list', async (ctx) => {
    await ctx.answerCbQuery();
    return sendLedgerList(ctx);
  });
  bot.action('ledger:create', async (ctx) => {
    inputModes.set(ctx.from.id, 'create_ledger');
    await ctx.answerCbQuery();
    return ctx.reply('✍️ Hãy gửi tên sổ mới. Gửi /cancel để hủy.');
  });
  bot.action('ledger:join', async (ctx) => {
    inputModes.set(ctx.from.id, 'join_ledger');
    await ctx.answerCbQuery();
    return ctx.reply('🔑 Hãy gửi mã mời. Gửi /cancel để hủy.');
  });
  bot.action('ledger:invite', async (ctx) => {
    await ctx.answerCbQuery();
    const ledger = requireOwnerLedger(ctx);
    if (ledger.kind !== 'shared') throw new InputError('Hãy tạo sổ chung trước khi mời thành viên.');
    const invitation = await createInvitation({ userId: ctx.from.id, ledgerId: ledger.id });
    return ctx.reply(`🔑 Mã mời: ${invitation.code}\nDùng một lần, hết hạn sau ${invitation.expiresInHours} giờ và cần owner phê duyệt.`);
  });
  bot.action('ledger:members', async (ctx) => {
    await ctx.answerCbQuery();
    return sendMembers(ctx);
  });
  bot.action('ledger:delete', async (ctx) => {
    await ctx.answerCbQuery();
    const ledger = requireOwnerLedger(ctx);
    return ctx.reply(`⚠️ Xóa vĩnh viễn sổ “${ledger.name}” cùng toàn bộ dữ liệu?`, Markup.inlineKeyboard([[
      Markup.button.callback('🗑 Xóa vĩnh viễn', `ledger:deleteconfirm:${ledger.id}`),
      Markup.button.callback('Hủy', 'menu:ledgers'),
    ]]));
  });
  bot.action('ledger:leave', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.state.ledger.role === 'owner') throw new InputError('Chủ sổ không thể rời sổ.');
    return ctx.reply(`Rời sổ “${ctx.state.ledger.name}”?`, Markup.inlineKeyboard([[
      Markup.button.callback('🚪 Xác nhận rời', `ledger:leaveconfirm:${ctx.state.ledger.id}`),
      Markup.button.callback('Hủy', 'menu:ledgers'),
    ]]));
  });
  bot.action(/^ledger:select:(\d+)$/, async (ctx) => {
    const selected = await selectLedger({ userId: ctx.from.id, ledgerId: Number(ctx.match[1]) });
    if (!selected) return ctx.answerCbQuery('Bạn không còn quyền truy cập sổ này.', { show_alert: true });
    const ledger = await getActiveLedger(ctx.from.id);
    ctx.state.ledger = ledger;
    await ctx.answerCbQuery('Đã chuyển sổ');
    return ctx.reply(`✅ Sổ hiện tại: “${ledger.name}”.`);
  });
  bot.action(/^ledger:leaveconfirm:(\d+)$/, async (ctx) => {
    const ledgerId = Number(ctx.match[1]);
    const access = await getLedgerAccess(ctx.from.id, ledgerId);
    const left = await leaveLedger({ userId: ctx.from.id, ledgerId });
    if (!left) return ctx.answerCbQuery('Không thể rời sổ này.', { show_alert: true });
    if (access) {
      await notifyUser(ctx, access.owner_user_id, `${telegramDisplayName(ctx.from)} đã rời sổ “${access.name}”.`);
    }
    ctx.state.ledger = await getActiveLedger(ctx.from.id);
    await ctx.answerCbQuery('Đã rời sổ');
    return ctx.editMessageText(`✅ Bạn đã rời sổ. Sổ hiện tại là “${ctx.state.ledger.name}”.`);
  });
  bot.action(/^ledger:deleteconfirm:(\d+)$/, async (ctx) => {
    const deleted = await deleteLedger({ ownerUserId: ctx.from.id, ledgerId: Number(ctx.match[1]) });
    if (!deleted) return ctx.answerCbQuery('Bạn không có quyền xóa sổ này.', { show_alert: true });
    ctx.state.ledger = await getActiveLedger(ctx.from.id);
    await ctx.answerCbQuery('Đã xóa sổ');
    return ctx.editMessageText(`🗑 Đã xóa “${deleted.name}”. Sổ hiện tại là “${ctx.state.ledger.name}”.`);
  });
  bot.action(/^join:(approve|reject):(\d+)$/, async (ctx) => {
    const approve = ctx.match[1] === 'approve';
    const reviewed = await reviewJoinRequest({
      ownerUserId: ctx.from.id,
      requestId: Number(ctx.match[2]),
      approve,
    });
    if (!reviewed) return ctx.answerCbQuery('Yêu cầu đã xử lý hoặc bạn không có quyền.', { show_alert: true });
    await ctx.answerCbQuery(approve ? 'Đã chấp nhận' : 'Đã từ chối');
    await ctx.telegram.sendMessage(
      reviewed.requester_chat_id,
      approve
        ? `✅ Bạn đã được thêm vào “${reviewed.name}” với quyền Thành viên.`
        : `❌ Yêu cầu tham gia “${reviewed.name}” đã bị từ chối.`,
      approve ? Markup.inlineKeyboard([[
        Markup.button.callback('Chuyển sang sổ này', `ledger:select:${reviewed.ledger_id}`),
      ]]) : undefined,
    );
    return ctx.editMessageText(`${approve ? '✅ Đã chấp nhận' : '❌ Đã từ chối'} ${reviewed.requester_name}.`);
  });
  bot.action(/^member:role:(\d+):(\d+):(member|viewer)$/, async (ctx) => {
    const [, ledgerId, targetUserId, role] = ctx.match;
    const changed = await changeMemberRole({
      ownerUserId: ctx.from.id,
      ledgerId: Number(ledgerId),
      targetUserId,
      role,
    });
    if (!changed) return ctx.answerCbQuery('Không thể đổi quyền.', { show_alert: true });
    const access = await getLedgerAccess(ctx.from.id, Number(ledgerId));
    if (access) {
      await notifyUser(ctx, targetUserId, `🔐 Quyền của bạn trong “${access.name}” đã đổi thành ${roleLabel(role)}.`);
    }
    await ctx.answerCbQuery('Đã đổi quyền');
    return ctx.editMessageText(`✅ Đã đổi quyền thành ${roleLabel(role)}.`);
  });
  bot.action(/^member:removeask:(\d+):(\d+)$/, async (ctx) => {
    const [, ledgerId, targetUserId] = ctx.match;
    await ctx.answerCbQuery();
    return ctx.reply('Thành viên sẽ mất quyền truy cập ngay; giao dịch cũ vẫn được giữ lại.', Markup.inlineKeyboard([[
      Markup.button.callback('Xác nhận xóa', `member:remove:${ledgerId}:${targetUserId}`),
      Markup.button.callback('Hủy', 'menu:ledgers'),
    ]]));
  });
  bot.action(/^member:remove:(\d+):(\d+)$/, async (ctx) => {
    const [, ledgerId, targetUserId] = ctx.match;
    const removed = await removeMember({
      ownerUserId: ctx.from.id,
      ledgerId: Number(ledgerId),
      targetUserId,
    });
    if (!removed) return ctx.answerCbQuery('Không thể xóa thành viên.', { show_alert: true });
    const access = await getLedgerAccess(ctx.from.id, Number(ledgerId));
    if (access) {
      await notifyUser(ctx, targetUserId, `Bạn đã bị xóa khỏi sổ “${access.name}”. Dữ liệu cũ vẫn được giữ lại.`);
    }
    await ctx.answerCbQuery('Đã xóa thành viên');
    return ctx.editMessageText('✅ Đã xóa thành viên khỏi sổ. Dữ liệu cũ vẫn được giữ lại.');
  });

  return async function handleLedgerTextInput(ctx) {
    const mode = inputModes.get(ctx.from.id);
    if (!mode) return false;
    if (mode === 'create_ledger') await handleCreateLedger(ctx, ctx.message.text);
    if (mode === 'join_ledger') await handleJoinLedger(ctx, ctx.message.text);
    inputModes.clear(ctx.from.id);
    return true;
  };
}

module.exports = { registerLedgerHandlers };
