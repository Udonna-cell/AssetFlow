const { Markup } = require('telegraf');
const UserModel = require('../../models/User');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');

const broadcastSessions = new Map();

module.exports = (bot) => {
  // 1. Mass Broadcast Menu
  bot.action('admin_broadcast', (ctx) => {
    broadcastSessions.set(ctx.from.id, { step: 'AWAIT_BROADCAST_TEXT' });

    ctx.reply(
      `📢 **Global Announcement Broadcast**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Send the message text/formatting you want to send to **ALL registered buyers**:\n\n` +
      `*(Supports Markdown formatting)*`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'home_menu')]])
    );
  });

  // 2. Direct DM / Credit User Menu
  bot.action('admin_direct_msg', (ctx) => {
    broadcastSessions.set(ctx.from.id, { step: 'AWAIT_DIRECT_USER_ID' });

    ctx.reply(
      `💬 **Direct Message & Credit User**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Please enter the **Telegram ID** of the user you wish to message or credit:`
    );
  });

  // Listen for Admin Input
  bot.on('text', async (ctx, next) => {
    const session = broadcastSessions.get(ctx.from.id);
    if (!session) return next();

    // Handling Global Broadcast
    if (session.step === 'AWAIT_BROADCAST_TEXT') {
      const messageText = ctx.message.text;
      broadcastSessions.delete(ctx.from.id);

      const users = await UserModel.getAll();
      if (!Array.isArray(users)) {
        return ctx.reply('⚠️ Failed to load user list.');
      }
      
      let sentCount = 0;
      let failCount = 0;

      const statusMsg = await ctx.reply(`🔄 Dispatching broadcast to ${users.length} users...`);

      for (const user of users) {
        if (!user.telegram_id) continue;
        try {
          await bot.telegram.sendMessage(user.telegram_id, `📢 **Announcement**\n\n${messageText}`, {
            parse_mode: 'Markdown'
          });
          sentCount++;
        } catch (err) {
          logger.warn(`Failed broadcast to ${user.telegram_id}: ${err.message}`);
          failCount++;
        }
      }

      try {
        await bot.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          null,
          `✅ **Broadcast Complete!**\n\n` +
          `📥 **Delivered:** ${sentCount}\n` +
          `❌ **Failed / Blocked:** ${failCount}`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        logger.error('Failed to update broadcast status message:', err.message);
      }
    }

    // Handling Step 1 Direct Message (Entering User ID)
    if (session.step === 'AWAIT_DIRECT_USER_ID') {
      const targetId = Number(ctx.message.text.trim());
      if (isNaN(targetId)) {
        return ctx.reply('⚠️ Invalid Telegram ID. Please enter numbers only.');
      }

      broadcastSessions.set(ctx.from.id, { step: 'AWAIT_DIRECT_ACTION', targetId });

      return ctx.reply(
        `👤 **Selected User:** \`${targetId}\`\n\nChoose an action:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('💬 Send Direct Message', `admin_dm_msg_${targetId}`)],
          [Markup.button.callback('💰 Add Balance to Wallet', `admin_credit_user_${targetId}`)]
        ])
      );
    }

    // Handling Direct Message Payload
    if (session.step === 'AWAIT_DIRECT_PAYLOAD') {
      const { targetId } = session;
      const textToSend = ctx.message.text;
      broadcastSessions.delete(ctx.from.id);

      try {
        await bot.telegram.sendMessage(targetId, `📩 **Message from Admin:**\n\n${textToSend}`, {
          parse_mode: 'Markdown'
        });
        ctx.reply(`✅ Message delivered to user \`${targetId}\`!`);
      } catch (err) {
        ctx.reply(`❌ Failed to send message to \`${targetId}\`. User may have stopped the bot.`);
      }
      return;
    }

    // Handling Credit User Payload
    if (session.step === 'AWAIT_CREDIT_AMOUNT') {
      const { targetId } = session;
      const amount = parseFloat(ctx.message.text.trim());
      broadcastSessions.delete(ctx.from.id);

      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('⚠️ Invalid amount specified.');
      }

      const updatedUser = await dbService.incrementUserBalance(targetId, amount);
      ctx.reply(`✅ Credited **$${amount}** to user \`${targetId}\`!`);

      // Notify User
      try {
        bot.telegram.sendMessage(
          targetId,
          `🎉 **Wallet Credited!**\n\nAn admin added **$${amount}** to your balance.\n` +
          `New Balance: \`$${Number(updatedUser.balance).toFixed(2)}\``,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {}
      return;
    }

    return next();
  });

  // Action listeners for Direct DM and Credit steps
  bot.action(/^admin_dm_msg_(\d+)$/, (ctx) => {
    const targetId = ctx.match[1];
    broadcastSessions.set(ctx.from.id, { step: 'AWAIT_DIRECT_PAYLOAD', targetId });
    ctx.reply(`💬 Reply with the message you want to send directly to user \`${targetId}\`:`);
  });

  bot.action(/^admin_credit_user_(\d+)$/, (ctx) => {
    const targetId = ctx.match[1];
    broadcastSessions.set(ctx.from.id, { step: 'AWAIT_CREDIT_AMOUNT', targetId });
    ctx.reply(`💰 Enter the amount ($) to credit to user \`${targetId}\`'s wallet:`);
  });
};
