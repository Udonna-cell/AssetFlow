const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const { escapeMarkdown } = require('../../utils/telegram');

module.exports = (bot) => {
  bot.action('buyer_catalog', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const categories = await dbService.getCategories();

    if (!categories || categories.length === 0) {
      const emptyText = `🛒 **AssetFlow Marketplace**\n━━━━━━━━━━━━━━━━━━━━\nNo active categories available right now.`;
      const emptyKeyboard = Markup.inlineKeyboard([[Markup.button.callback('🏠 Home', 'home_menu')]]);
      return ctx.editMessageText(emptyText, { parse_mode: 'Markdown', ...emptyKeyboard }).catch(() => {});
    }

    const text = `🛒 **AssetFlow Marketplace Catalog**\nSelect a category to browse:`;
    const buttons = categories.map(cat => [Markup.button.callback(`📁 ${escapeMarkdown(cat.name)}`, `cat_view_${cat.id}`)]);
    buttons.push([Markup.button.callback('🏠 Back to Home', 'home_menu')]);

    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(() => {});
  });

  bot.action(/^cat_view_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const categoryId = ctx.match[1];
    const products = await dbService.getProductsByCategory(categoryId);

    if (!products || products.length === 0) {
      return ctx.editMessageText(`📁 **Category Products**\n\nNo products available here.`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Categories', 'buyer_catalog')]])
      }).catch(() => {});
    }

    const text = `🛍️ **Available Items:**\nSelect an item to view specs or buy:`;
    const buttons = products.map(prod => [
      Markup.button.callback(
        `${escapeMarkdown(prod.title)} — $${Number(prod.price).toFixed(2)} (${prod.stock_count || 0} left | ❤️ ${prod.likes_count || 0})`,
        `prod_view_${prod.id}`
      )
    ]);
    buttons.push([Markup.button.callback('🔙 Back to Categories', 'buyer_catalog')]);

    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(() => {});
  });

  async function renderProductView(ctx, productId) {
    const product = await dbService.getProductById(productId);
    if (!product) return ctx.answerCbQuery('⚠️ Product unavailable.').catch(() => {});

    const user = await dbService.getUser(ctx.from.id);
    const isFav = (user.favorites || []).includes(Number(productId));
    const stockCount = Number(product.stock_count || 0);
    const vipInfo = await dbService.getVIPInfo(user);

    const price = Number(product.price);
    const discountedPrice = price - (price * (vipInfo.discountPercent / 100));

    let priceDisplay = `\`$${price.toFixed(2)}\``;
    if (vipInfo.discountPercent > 0) {
      priceDisplay = `~\`$${price.toFixed(2)}\`~ ➡️ \`$${discountedPrice.toFixed(2)}\` (${vipInfo.discountPercent}% VIP Off)`;
    }

    const text = 
      `📦 **${escapeMarkdown(product.title)}**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📝 **Description:** ${escapeMarkdown(product.description || 'No detailed description.')}\n` +
      `⏱️ **Warranty:** \`${product.warranty_hours || 24} Hours\`\n\n` +
      `💵 **Price:** ${priceDisplay}\n` +
      `📊 **In Stock:** \`${stockCount} item(s)\`\n` +
      `❤️ **Favorites:** \`${product.likes_count || 0} user(s)\`\n\n` +
      `💳 **Your Balance:** \`$${Number(user.balance || 0).toFixed(2)}\``;

    const keyboardButtons = [];

    if (stockCount > 0) {
      keyboardButtons.push([Markup.button.callback('⚡ Buy Now (Instant Delivery)', `prod_buy_${product.id}`)]);
    } else {
      keyboardButtons.push([
        Markup.button.callback('🔔 Notify Me On Restock', `sub_restock_${product.id}`)
      ]);
    }

    keyboardButtons.push([
      Markup.button.callback(isFav ? '💔 Remove Favorite' : '❤️ Add to Favorites', `fav_toggle_${product.id}`),
      Markup.button.callback('🔙 Category List', `cat_view_${product.category_id}`)
    ]);

    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboardButtons) }).catch(() => {});
  }

  bot.action(/^prod_view_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    await renderProductView(ctx, ctx.match[1]);
  });

  bot.action(/^fav_toggle_(\d+)$/, async (ctx) => {
    const { isAdded } = await dbService.toggleUserFavorite(ctx.from.id, ctx.match[1]);
    ctx.answerCbQuery(isAdded ? '❤️ Added to Favorites!' : '💔 Removed from Favorites.').catch(() => {});
    await renderProductView(ctx, ctx.match[1]);
  });

  bot.action(/^sub_restock_(\d+)$/, async (ctx) => {
    const isSubbed = await dbService.toggleRestockSubscription(ctx.match[1], ctx.from.id);
    ctx.answerCbQuery(isSubbed ? '🔔 Restock alert enabled for this product!' : '🔕 Restock alert disabled.').catch(() => {});
  });
};
