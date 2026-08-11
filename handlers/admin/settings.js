const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');
const config = require('../../config');

// Using a simple Map for admin interaction sessions
const adminSettingsSessions = new Map();

const DB_KEYS = ['host', 'user', 'password', 'database', 'port'];

module.exports = (bot) => {
  // Main Settings Menu
  bot.action('admin_settings', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    
    return ctx.editMessageText(
      `⚙️ **Admin Configuration Settings**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Select a category to manage:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🗄️ Database Settings', 'admin_settings_db')],
          [Markup.button.callback('👥 Manage Admins', 'admin_settings_admins')],
          [Markup.button.callback('🏠 Back to Home', 'admin_home')]
        ])
      }
    ).catch(() => {});
  });

  // DB settings management
  bot.action('admin_settings_db', async (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      
      let text = `🗄️ **Database Settings**\n━━━━━━━━━━━━━━━━━━━━\n`;
      const keyboard = [];

      for (const key of DB_KEYS) {
        let val = await dbService.getSetting(`db_${key}`);
        if (!val) val = config.mysql[key];
        
        text += `• **${key.toUpperCase()}:** \`${key === 'password' ? '********' : val}\`\n`;
        keyboard.push([Markup.button.callback(`✏️ Edit ${key.toUpperCase()}`, `edit_db_${key}`)]);
      }
      
      keyboard.push([Markup.button.callback('🔙 Back to Settings', 'admin_settings')]);

      ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) }).catch(() => {});
  });

  // Handle editing specific keys
  bot.action(/^edit_db_(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery(`Enter new value for ${key.toUpperCase()}:`).catch(() => {});
    
    adminSettingsSessions.set(ctx.from.id, { step: 'AWAIT_DB_VALUE', key });
    ctx.reply(`✏️ Enter the new value for \`${key.toUpperCase()}\`:`);
  });

  // Admin management
  bot.action('admin_settings_admins', async (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      
      const adminIdsStr = await dbService.getSetting('admin_ids') || config.adminIds.join(',');
      const adminIds = adminIdsStr.split(',').filter(Boolean);

      let text = `👥 **Manage Administrators**\n━━━━━━━━━━━━━━━━━━━━\n`;
      text += `Current Admins (Telegram IDs):\n`;
      adminIds.forEach(id => text += `• \`${id}\`\n`);
      text += `\nSelect an action:`;

      return ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➕ Add Admin', 'admin_add_admin')],
          [Markup.button.callback('➖ Remove Admin', 'admin_remove_admin')],
          [Markup.button.callback('🔙 Back to Settings', 'admin_settings')]
        ])
      }).catch(() => {});
  });

  bot.action('admin_add_admin', (ctx) => {
      ctx.answerCbQuery('Enter new admin Telegram ID:').catch(() => {});
      adminSettingsSessions.set(ctx.from.id, { step: 'AWAIT_ADD_ADMIN' });
      ctx.reply('✏️ Enter the Telegram ID of the new admin:');
  });

  bot.action('admin_remove_admin', (ctx) => {
      ctx.answerCbQuery('Enter admin Telegram ID to remove:').catch(() => {});
      adminSettingsSessions.set(ctx.from.id, { step: 'AWAIT_REMOVE_ADMIN' });
      ctx.reply('✏️ Enter the Telegram ID of the admin to remove:');
  });

  // Handle text input for updates
  bot.on('text', async (ctx, next) => {
    const session = adminSettingsSessions.get(ctx.from.id);
    if (!session) return next();

    const value = ctx.message.text.trim();
    
    if (session.step === 'AWAIT_DB_VALUE') {
        await dbService.updateSetting(`db_${session.key}`, value);
        adminSettingsSessions.delete(ctx.from.id);
        ctx.reply(`✅ Updated ${session.key.toUpperCase()}. Please restart the bot for changes to take effect.`);
    } else if (session.step === 'AWAIT_ADD_ADMIN') {
        const adminIdsStr = await dbService.getSetting('admin_ids') || config.adminIds.join(',');
        const adminIds = adminIdsStr.split(',').filter(Boolean);
        if (!adminIds.includes(value)) {
            adminIds.push(value);
            await dbService.updateSetting('admin_ids', adminIds.join(','));
        }
        adminSettingsSessions.delete(ctx.from.id);
        ctx.reply(`✅ Admin \`${value}\` added.`);
    } else if (session.step === 'AWAIT_REMOVE_ADMIN') {
        const adminIdsStr = await dbService.getSetting('admin_ids') || config.adminIds.join(',');
        let adminIds = adminIdsStr.split(',').filter(Boolean);
        adminIds = adminIds.filter(id => id !== value);
        await dbService.updateSetting('admin_ids', adminIds.join(','));
        adminSettingsSessions.delete(ctx.from.id);
        ctx.reply(`✅ Admin \`${value}\` removed.`);
    } else {
        next();
    }
  });
};
