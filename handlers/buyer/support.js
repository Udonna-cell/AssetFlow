const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');
const config = require('../../config');

const buyerSupportSessions = new Map();

module.exports = (bot) => {
  // 1. Buyer Support Main Menu
  bot.action('buyer_support', async (ctx) => {
    const text = 
      `🎧 **AssetFlow Customer Support**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `How can our automated support system assist you today?\n\n` +
      `Select an issue type below or browse our self-help guides:`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📦 Report Order Problem', 'support_issue_order'),
        Markup.button.callback('💳 Deposit / Wallet Help', 'support_issue_deposit')
      ],
      [
        Markup.button.callback('📝 General Question', 'support_issue_general'),
        Markup.button.callback('❓ FAQs & Guides', 'buyer_faq')
      ],
      [Markup.button.callback('🏠 Back to Home', 'home_menu')]
    ]);

    if (ctx.callbackQuery) {
      return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
    }
    return ctx.replyWithMarkdown(text, keyboard);
  });

  // 2. Select Issue Type
  const issueTypes = {
    support_issue_order: 'Order Issue',
    support_issue_deposit: 'Deposit Inquiry',
    support_issue_general: 'General Help'
  };

  Object.keys(issueTypes).forEach((actionKey) => {
    bot.action(actionKey, (ctx) => {
      const categoryName = issueTypes[actionKey];
      buyerSupportSessions.set(ctx.from.id, { step: 'AWAITING_TICKET_MSG', category: categoryName });

      const text = 
        `📝 **Describe Your Issue (${categoryName})**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Please type a message explaining your inquiry. Include any relevant order IDs or details.\n\n` +
        `*(An automated support ticket will be created immediately upon sending).*`;

      return ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'buyer_support')]])
      }).catch(() => {});
    });
  });

  // 3. Listen for Ticket Message Input
  bot.on('text', async (ctx, next) => {
    const session = buyerSupportSessions.get(ctx.from.id);
    if (!session || session.step !== 'AWAITING_TICKET_MSG') return next();

    const userMsg = ctx.message.text.trim();
    buyerSupportSessions.delete(ctx.from.id);

    // Save ticket in Database
    const ticket = await dbService.createTicket({
      user_id: ctx.from.id,
      category: session.category,
      message: userMsg,
      status: 'open'
    });

    // Illusion Response for Buyer
    const confirmationText = 
      `🎫 **Support Ticket Created: #TICK-${ticket.id}**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Your query has been queued in our automated support desk.\n\n` +
      `An agent will respond directly to this chat session shortly.\n\n` +
      `⏱️ *Estimated wait time: ~5–15 minutes.*`;

    await ctx.replyWithMarkdown(confirmationText, Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Return to Home', 'home_menu')]
    ]));

    // Dispatch Notification to Admins
    notifyAdminsNewTicket(bot, ctx.from, ticket);
  });
};

async function notifyAdminsNewTicket(bot, buyer, ticket) {
  const adminText = 
    `📩 **NEW SUPPORT TICKET #TICK-${ticket.id}**\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 **Buyer:** @${buyer.username || 'NoUsername'} (\`${buyer.id}\`)\n` +
    `🏷️ **Category:** ${ticket.category}\n` +
    `💬 **Message:** "${ticket.message}"\n\n` +
    `Select a quick resolution action below:`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('💬 Direct Reply', `admin_reply_ticket_${ticket.id}_${buyer.id}`),
      Markup.button.callback('💰 Refund User', `admin_refund_ticket_${ticket.id}_${buyer.id}`)
    ],
    [Markup.button.callback('❌ Close Ticket', `admin_close_ticket_${ticket.id}`)]
  ]);

  config.adminIds.forEach((adminId) => {
    bot.telegram.sendMessage(adminId, adminText, { parse_mode: 'Markdown', ...keyboard }).catch((err) => {
      logger.error(`Failed to alert admin ${adminId} for ticket #${ticket.id}:`, err.message);
    });
  });
}
