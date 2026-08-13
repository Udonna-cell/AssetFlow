const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const buyerNavigation = require('../../utils/buyerNavigation');

module.exports = (bot) => {
  bot.action('buyer_favorites', async (ctx) => {
    buyerNavigation.push(ctx, 'buyer_favorites');
    ctx.answerCbQuery().catch(() => {});
    const favProducts = await dbService.getFavoriteProducts(ctx.from.id);

    if (!favProducts || favProducts.length === 0) {
      return ctx.editMessageText(
        `⭐ **My Favorites List**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `You haven't added any products to your favorites list yet!\n\n` +
        `Browse the catalog and tap "❤️ Add to Favorites" to save listings here.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Browse Marketplace', 'buyer_catalog')],
            [Markup.button.callback('🏠 Back', 'buyer_back')]
          ])
        }
      ).catch(() => {});
    }

    let text = `⭐ **My Saved Favorites (${favProducts.length}):**\n━━━━━━━━━━━━━━━━━━━━\nSelect a product to view or purchase:`;
    const buttons = favProducts.map(prod => [
      Markup.button.callback(
        `❤️ ${prod.title} — $${Number(prod.price).toFixed(2)} (${prod.stock_count || 0} left)`,
        `prod_view_${prod.id}`
      )
    ]);

    buttons.push([Markup.button.callback('🏠 Back', 'buyer_back')]);

    return ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }).catch(() => {});
  });
};
