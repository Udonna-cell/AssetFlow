const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');

const adminSupportSessions = new Map();

module.exports = (bot) => {
  // 1. Direct Reply Action
  bot.action(/^admin_reply_ticket_(\d+)_(\d+)$/, (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const ticketId = ctx.match[1];
    const buyerId = ctx.match[2];

    adminSupportSessions.set(ctx.from.id, { step: 'AWAIT_REPLY_TEXT', ticketId, buyerId });

    ctx.replyWithMarkdown(
      `💬 **Reply to Ticket #TICK-${ticketId}**\n━━━━━━━━━━━━━━━━━━━━\nType your response for Buyer \`${buyerId}\`:`
    );
  });

  // 2. Initiate Refund Flow from Support Ping
  bot.action(/^admin_refund_ticket_(\d+)_(\d+)$/, (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const ticketId = ctx.match[1];
    const buyerId = ctx.match[2];

    adminSupportSessions.set(ctx.from.id, { step: 'AWAIT_REFUND_AMOUNT', ticketId, buyerId });

    ctx.replyWithMarkdown(
      `💰 **Issue Refund for Ticket #TICK-${ticketId}**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Enter the exact dollar amount ($) to credit to Buyer \`${buyerId}\`'s wallet:`
    );
  });

  // 3. Multi-step Text Input Listener for Admin Replies & Refunds
  bot.on('text', async (ctx, next) => {
    const session = adminSupportSessions.get(ctx.from.id);
    if (!session) return next();

    // STEP A: DIRECT REPLY
    if (session.step === 'AWAIT_REPLY_TEXT') {
      const replyText = ctx.message.text.trim();
      const { ticketId, buyerId } = session;
      adminSupportSessions.delete(ctx.from.id);

      const buyerNotification = 
        `💬 **Message from AssetFlow Support (#TICK-${ticketId}):**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `"${replyText}"`;

      try {
        await bot.telegram.sendMessage(buyerId, buyerNotification, { parse_mode: 'Markdown' });
        await dbService.updateTicketStatus(ticketId, 'replied');
        ctx.reply(`✅ Response delivered successfully to Buyer \`${buyerId}\`!`);
      } catch (err) {
        logger.error(`Could not send support response to buyer ${buyerId}:`, err.message);
        ctx.reply(`⚠️ Failed to deliver message. Buyer may have stopped the bot.`);
      }
      return;
    }

    // STEP B: REFUND AMOUNT INPUT
    if (session.step === 'AWAIT_REFUND_AMOUNT') {
      const refundAmount = parseFloat(ctx.message.text.trim());
      const { ticketId, buyerId } = session;

      if (isNaN(refundAmount) || refundAmount <= 0) {
        return ctx.reply('⚠️ Invalid amount. Please enter a positive number (e.g., 5.00 or 12):');
      }

      adminSupportSessions.delete(ctx.from.id);

      const result = await dbService.processRefund({
        ticketId,
        userId: buyerId,
        amount: refundAmount
      });

      if (result.error) {
        return ctx.reply(`❌ Refund failed: ${result.error}`);
      }

      ctx.replyWithMarkdown(
        `✅ **Refund Processed Successfully!**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💵 **Amount Credited:** \`$${refundAmount.toFixed(2)}\`\n` +
        `👤 **Buyer ID:** \`${buyerId}\`\n` +
        `🎫 **Ticket #TICK-${ticketId}** has been closed.`
      );

      // Notify Buyer Automatically
      const formattedBalance = Number(result.newBalance).toLocaleString('en-US', { minimumFractionDigits: 2 });
      const buyerRefundNotice = 
        `🎉 **Refund Issued!**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Our support team has processed a refund of **$${refundAmount.toFixed(2)}** for Ticket **#TICK-${ticketId}**.\n\n` +
        `💳 **New Wallet Balance:** \`$${formattedBalance}\`\n\n` +
        `You can use your updated balance to purchase any item in our catalog.`;

      bot.telegram.sendMessage(buyerId, buyerRefundNotice, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🛒 Browse Market', 'buyer_catalog')]])
      }).catch(() => {});
      return;
    }

    return next();
  });

  // 4. Close Ticket Action
  bot.action(/^admin_close_ticket_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery('Ticket closed.').catch(() => {});
    const ticketId = ctx.match[1];
    await dbService.updateTicketStatus(ticketId, 'closed');

    return ctx.editMessageText(`❌ **Support Ticket #TICK-${ticketId} Closed.**`, {
      parse_mode: 'Markdown'
    }).catch(() => {});
  });
};
