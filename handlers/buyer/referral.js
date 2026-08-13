const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const buyerNavigation = require('../../utils/buyerNavigation');

module.exports = (bot) => {
  bot.action('buyer_referral', async (ctx) => {
    buyerNavigation.push(ctx, 'buyer_referral');
    ctx.answerCbQuery().catch(() => {});
    const user = await dbService.getUser(ctx.from.id);
    const botInfo = await bot.telegram.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=ref_${ctx.from.id}`;

    const vipInfo = await dbService.getVIPInfo(user);

    const text = 
      `👥 **Affiliate Program & VIP Status**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👑 **Your VIP Tier:** \`${vipInfo.tier}\`\n` +
      `🎁 **Current Discount:** \`${vipInfo.discountPercent}%\` off all orders\n` +
      `📈 **Total Spent:** \`$${Number(vipInfo.totalSpent).toFixed(2)}\` / $150 (Silver) / $500 (Gold)\n\n` +
      `🔗 **Your Unique Referral Link:**\n` +
      `\`${refLink}\`\n\n` +
      `💡 *Earn 5% commission directly into your wallet balance whenever users you invite complete a purchase!*`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Back', 'buyer_back')]
    ]);

    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
  });
};
