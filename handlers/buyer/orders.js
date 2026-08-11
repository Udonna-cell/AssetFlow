const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const jsonEngine = require('../../database/jsonEngine');
const logger = require('../../utils/logger');
const config = require('../../config');

module.exports = (bot) => {
  // 1. BUY NOW HANDLER
  bot.action(/^prod_buy_(\d+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const userId = ctx.from.id;

    const product = await dbService.getProductById(productId);

    if (!product) {
      return ctx.answerCbQuery('⚠️ Product no longer available.', { show_alert: true }).catch(() => {});
    }

    const price = Number(product.price);
    const user = await dbService.getUser(userId);
    const currentBalance = Number(user.balance || 0);

    // Pre-check balance before processing purchase
    if (currentBalance < price) {
      const missing = (price - currentBalance).toFixed(2);
      ctx.answerCbQuery(`⚠️ Insufficient balance! You need $${missing} more.`, { show_alert: true }).catch(() => {});

      return ctx.editMessageText(
        `⚠️ **Insufficient Balance**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📦 **Product:** ${product.title}\n` +
        `💵 **Price:** \`$${price.toFixed(2)}\`\n` +
        `💳 **Your Balance:** \`$${currentBalance.toFixed(2)}\`\n` +
        `📉 **Deficit:** \`$${missing}\`\n\n` +
        `Please fund your wallet to complete this purchase.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Top-Up Wallet Now', 'buyer_deposit')],
            [Markup.button.callback('🔙 Back to Product', `prod_view_${productId}`)]
          ])
        }
      ).catch(() => {});
    }

    // Execute atomic purchase via dbService
    const result = await dbService.purchaseStockItem(productId, userId, price);

    if (result.error === 'OUT_OF_STOCK') {
      ctx.answerCbQuery('⚠️ Out of stock! Someone else just purchased the last item.', { show_alert: true }).catch(() => {});
      return ctx.editMessageText(
        `🔴 **Item Out of Stock**\n\nThis item just sold out. Please check back later or choose another product.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🛒 Back to Marketplace', 'buyer_catalog')]])
        }
      ).catch(() => {});
    }

    if (result.error === 'INSUFFICIENT_FUNDS') {
      return ctx.answerCbQuery('⚠️ Insufficient wallet balance!', { show_alert: true }).catch(() => {});
    }

    // Check if item depleted
    const updatedProduct = await dbService.getProductById(productId);
    if (updatedProduct.stock_count === 0) {
      config.adminIds.forEach(adminId => {
        bot.telegram.sendMessage(adminId, `⚠️ **STOCK DEPLETED**\nProduct "${updatedProduct.title}" is now out of stock.`).catch((err) => {
          logger.error(`Failed to alert admin ${adminId} of stock depletion:`, err.message);
        });
      });
    }

    ctx.answerCbQuery('🎉 Purchase successful! Details delivered.').catch(() => {});

    // Format delivery message
    const formattedBalance = Number(result.newBalance).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const deliveryText = 
      `🎉 **Purchase Successful!**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 **Product:** ${product.title}\n` +
      `💵 **Price Paid:** \`$${price.toFixed(2)}\`\n` +
      `💳 **Remaining Balance:** \`$${formattedBalance}\` \n` +
      `🆔 **Order ID:** \`${result.orderId}\`\n\n` +
      `🔑 **Your Delivered Credentials:**\n` +
      `\`\`\`\n` +
      `${result.credentials}\n` +
      `\`\`\`\n` +
      `💡 *Tip: Tap the text block above to copy credentials instantly. You can also re-view your purchase history in your Order Vault.*`;

    return ctx.editMessageText(deliveryText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📦 Open Order Vault', 'buyer_orders')],
        [Markup.button.callback('🛒 Continue Shopping', 'buyer_catalog')]
      ])
    }).catch(() => {});
  });

  // 2. ORDER VAULT (MY PURCHASES)
  bot.action('buyer_orders', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from.id;
    const db = jsonEngine.read();
    const userOrders = (db.orders || []).filter(o => Number(o.user_id) === Number(userId));

    if (userOrders.length === 0) {
      return ctx.editMessageText(
        `📦 **My Orders Vault**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `You have not made any purchases yet!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🛒 Browse Marketplace', 'buyer_catalog')]])
        }
      ).catch(() => {});
    }

    let vaultText = `📦 **My Purchased Accounts Vault (${userOrders.length}):**\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Fetch product details for each order to get the title
    const ordersWithDetails = await Promise.all(userOrders.slice(-5).reverse().map(async (ord) => {
        const product = await dbService.getProductById(ord.product_id);
        return { ...ord, product_title: product ? product.title : 'Unknown Product' };
    }));

    ordersWithDetails.forEach((ord, index) => {
      vaultText += 
        `\n${index + 1}. **${ord.product_title}**\n` +
        `   ├ 🆔 Order: \`${ord.order_id}\` | Paid: \`$${Number(ord.price_paid).toFixed(2)}\`\n` +
        `   └ 🔑 Credentials:\n\`\`\`\n${ord.credentials_delivered}\n\`\`\`\n`;
    });

    vaultText += `\n💡 *Tip: Tap the credential blocks above to copy them instantly.*`;

    return ctx.editMessageText(vaultText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛒 Browse Market', 'buyer_catalog')],
        [Markup.button.callback('🏠 Main Menu', 'home_menu')]
      ])
    }).catch(() => {});
  });
};
