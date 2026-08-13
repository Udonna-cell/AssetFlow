const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');
const adminNavigation = require('../../utils/adminNavigation');

const adminActionSessions = new Map();

const getAdminDashboardKeyboard = (ctx) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📦 Inventory', 'admin_inventory'),
      Markup.button.callback('📊 Analytics', 'admin_analytics')
    ],
    [
      Markup.button.callback('💳 Deposits', 'admin_deposits'),
      Markup.button.callback('🎧 Support', 'admin_support')
    ],
    [
      Markup.button.callback('📢 Broadcasts', 'admin_broadcasts'),
      Markup.button.callback('📋 Templates', 'admin_broadcast_templates')
    ],
    [
      Markup.button.callback('👥 Users', 'admin_list_users_0'),
      Markup.button.callback('🚫 Frozen Accounts', 'admin_frozen_list')
    ],
    [
      Markup.button.callback('🏆 Highest Buyers', 'admin_top_buyers'),
      Markup.button.callback('💾 Export Database', 'admin_export_db')
    ],
    [
      Markup.button.callback('⚙️ Settings', 'admin_settings')
    ]
  ]);
};

const adminHomeHandlers = {
  adminDashboard: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    adminNavigation.clear(ctx); // Reset on home
    const text = `🛠️ **Admin Dashboard**\nWelcome back, Administrator.`;
    ctx.replyWithMarkdown(text, getAdminDashboardKeyboard(ctx));
  },

  adminBack: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    const targetAction = adminNavigation.pop(ctx);
    // Trigger the target action. This is tricky with Telegraf. 
    // We might need to manually trigger the handler or use bot.handleUpdate?
    // Let's assume we can re-trigger by calling the action handler or similar.
    // For now, let's keep it simple: just redirect back to home if we can't easily re-trigger.
    
    // As a workaround, just redirect to 'admin_home' if not implemented.
    if (targetAction === 'admin_home') {
        adminHomeHandlers.adminDashboard(ctx);
    } else {
        // This is a simplification.
        adminHomeHandlers.adminDashboard(ctx);
    }
  },

  exportDatabaseAction: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    ctx.answerCbQuery('Exporting database as SQL...').catch(() => {});
    
    const sqlDump = await dbService.exportDatabase(true);
    
    await ctx.replyWithDocument({ source: Buffer.from(sqlDump), filename: 'database_export.sql' });
  },

  listUsers: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    ctx.answerCbQuery().catch(() => {});
    
    const page = parseInt(ctx.match[1]);
    const users = await dbService.getAllUsers();
    
    if (!users || users.length === 0) return ctx.editMessageText('⚠️ No users found.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'admin_home')]]) });

    const user = users[page];
    const totalPages = users.length;
    
    const text = `👥 **User Detail (${page + 1}/${totalPages}):**\n\n` +
                 `👤 Username: @${user.username || 'NoUsername'}\n` +
                 `🆔 ID: \`${user.telegram_id}\`\n` +
                 `💰 Balance: \`$${Number(user.balance || 0).toFixed(2)}\`\n` +
                 `📈 Total Spent: \`$${Number(user.total_spent || 0).toFixed(2)}\`\n` +
                 `⭐ Favorites: ${user.favorites ? user.favorites.length : 0} items\n` +
                 `🛡️ Status: ${user.is_frozen ? '🚫 Frozen' : '✅ Active'}\n`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⬅️ Prev', `admin_list_users_${Math.max(0, page - 1)}`),
        Markup.button.callback('➡️ Next', `admin_list_users_${Math.min(totalPages - 1, page + 1)}`)
      ],
      [
        Markup.button.callback('💬 DM', `admin_dm_${user.telegram_id}_${page}`),
        Markup.button.callback('💰 Credit', `admin_credit_${user.telegram_id}_${page}`),
        Markup.button.callback(user.is_frozen ? '🔓 Unfreeze' : '🚫 Freeze', `admin_freeze_${user.telegram_id}_${page}`)
      ],
      [
        Markup.button.callback('🔙 Back to Dashboard', 'admin_home')
      ]
    ]);

    ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
  },


  listFrozenAccounts: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    ctx.answerCbQuery().catch(() => {});
    const users = await dbService.getAllUsers();
    const frozenUsers = users.filter(u => u.is_frozen);
    
    if (frozenUsers.length === 0) return ctx.editMessageText('✅ No frozen accounts found.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'admin_home')]]) });

    let text = `🚫 **Frozen Accounts:**\n\n`;
    const keyboard = [];
    frozenUsers.forEach(u => {
      text += `• @${u.username || 'NoUsername'} (\`${u.telegram_id}\`)\n`;
      keyboard.push([Markup.button.callback(`🔓 Unfreeze @${u.username || u.telegram_id}`, `admin_unfreeze_specific_${u.telegram_id}`)]);
    });
    keyboard.push([Markup.button.callback('🔙 Back to Dashboard', 'admin_home')]);

    ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) }).catch(() => {});
  },

  unfreezeSpecific: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    const telegramId = ctx.match[1];
    
    const isFrozen = await dbService.toggleUserFreeze(telegramId);
    ctx.answerCbQuery(isFrozen ? 'Account frozen.' : 'Account unfrozen.').catch(() => {});
    
    try {
      await ctx.telegram.sendMessage(
        telegramId,
        isFrozen 
          ? '🚫 **Your account has been frozen by an administrator.** You cannot make any purchases at this time.' 
          : '✅ **Your account has been unfrozen.** You can now make purchases.',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error(`Failed to notify user ${telegramId} about freeze status:`, err.message);
    }
    
    // Refresh the frozen list
    adminHomeHandlers.listFrozenAccounts(ctx);
  },

  freezeUser: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    const telegramId = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    
    const isFrozen = await dbService.toggleUserFreeze(telegramId);
    
    ctx.answerCbQuery(isFrozen ? 'User account frozen.' : 'User account unfrozen.').catch(() => {});
    
    try {
      await ctx.telegram.sendMessage(
        telegramId,
        isFrozen 
          ? '🚫 **Your account has been frozen by an administrator.** You cannot make any purchases at this time.' 
          : '✅ **Your account has been unfrozen.** You can now make purchases.',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error(`Failed to notify user ${telegramId} about freeze status:`, err.message);
    }
    
    ctx.editMessageText(`Status updated to: ${isFrozen ? 'Frozen' : 'Active'}.`, {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to User', `admin_list_users_${page}`)]])
    }).catch(() => {});
  },

  creditUser: (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    ctx.answerCbQuery().catch(() => {});
    const userId = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    adminActionSessions.set(ctx.from.id, { step: 'AWAIT_CREDIT_AMOUNT', userId, page });
    ctx.reply(`💰 Enter amount to credit to user \`${userId}\`:`);
  },

  dmUser: (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    ctx.answerCbQuery().catch(() => {});
    const userId = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    adminActionSessions.set(ctx.from.id, { step: 'AWAIT_DM_TEXT', userId, page });
    ctx.reply(`💬 Enter message to send to user \`${userId}\`:`);
  },

  handleTextInput: async (ctx, next) => {
    const session = adminActionSessions.get(ctx.from.id);
    if (!session) return next();

    if (session.step === 'AWAIT_CREDIT_AMOUNT') {
      const amount = parseFloat(ctx.message.text.trim());
      if (isNaN(amount) || amount <= 0) return ctx.reply('⚠️ Invalid amount.');
      
      await dbService.incrementUserBalance(session.userId, amount);
      const page = session.page;
      adminActionSessions.delete(ctx.from.id);
      
      ctx.reply(`✅ Credited $${amount.toFixed(2)} to ${session.userId}`, {
          ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to User', `admin_list_users_${page}`)]])
      });
    } else if (session.step === 'AWAIT_DM_TEXT') {
      const text = ctx.message.text.trim();
      const page = session.page;
      try {
        await ctx.telegram.sendMessage(session.userId, `📢 Admin Message: ${text}`);
        ctx.reply(`✅ Message sent to ${session.userId}`, {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to User', `admin_list_users_${page}`)]])
        });
      } catch (err) {
        ctx.reply(`⚠️ Failed to send message.`);
      }
      adminActionSessions.delete(ctx.from.id);
    } else {
      next();
    }
  },

  topBuyers: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    ctx.answerCbQuery().catch(() => {});
    const topBuyers = await dbService.getTopBuyers();
    
    if (!topBuyers || topBuyers.length === 0) return ctx.editMessageText('⚠️ No buyers found.');

    let text = `🏆 **Top Buyers (Total Spent):**\n\n`;
    topBuyers.forEach((u, index) => {
      text += `${index + 1}. @${u.username || 'NoUsername'} - \`${Number(u.total_spent || 0).toFixed(2)}\`\n`;
    });

    ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'admin_home')]]) });
  },

  backToHome: async (ctx) => {
    if (!ctx.state.ensureAdmin()) return;
    ctx.answerCbQuery().catch(() => {});
    const text = `🛠️ **Admin Dashboard**\nWelcome back, Administrator.`;
    ctx.editMessageText(text, { parse_mode: 'Markdown', ...getAdminDashboardKeyboard() }).catch(() => {});
  }
};

module.exports = adminHomeHandlers;
