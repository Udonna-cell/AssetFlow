const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const adminNavigation = require('../../utils/adminNavigation');

module.exports = (bot) => {
  bot.action('admin_analytics', async (ctx) => {
    adminNavigation.push(ctx, 'admin_analytics');
    ctx.answerCbQuery().catch(() => {});

    const stats = await dbService.getSalesAnalytics();

    const formattedDeposits = Number(stats.totalDeposited || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const formattedUserBalances = Number(stats.totalUserBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const formattedRevenue = Number(stats.totalRevenueSpent || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

    let topLikedText = '';
    if (stats.topLikedProducts && stats.topLikedProducts.length > 0) {
      stats.topLikedProducts.forEach((prod, i) => {
        topLikedText += `   └ #${i + 1} **${prod.title}** (❤️ ${prod.likes_count || 0} likes)\n`;
      });
    } else {
      topLikedText = '   └ *No liked products yet.*\n';
    }

    const reportText = 
      `📊 **AssetFlow Sales & System Analytics**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 **Financial Metrics:**\n` +
      `   ├ Total Deposits Approved: \`$${formattedDeposits}\` (${stats.approvedDepositsCount || 0} transactions)\n` +
      `   ├ Total Sales Revenue: \`$${formattedRevenue}\` (${stats.totalOrders || 0} orders)\n` +
      `   └ Unspent User Balances: \`$${formattedUserBalances}\` in circulation\n\n` +
      `👥 **User Base:**\n` +
      `   └ Registered Users: \`${stats.totalUsers}\` active accounts\n\n` +
      `❤️ **Top Favorite Items:**\n` +
      `${topLikedText}\n` +
      `⚠️ **Inventory Health:**\n` +
      `   └ Out of Stock Products: \`${stats.outOfStockCount}\` item(s) need refilling\n\n` +
      `🕒 *Report updated in real-time.*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔄 Refresh Analytics', 'admin_analytics'),
        Markup.button.callback('📥 Refill Out of Stock', 'admin_refill_stock')
      ],
      [Markup.button.callback('🏠 Admin Dashboard', 'admin_back')]
    ]);

    return ctx.editMessageText(reportText, {
      parse_mode: 'Markdown',
      ...keyboard
    }).catch(() => {});
  });
};
