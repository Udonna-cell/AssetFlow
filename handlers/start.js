const { Markup } = require('telegraf');
const { escapeMarkdown } = require('../utils/telegram');

async function sendHomeMenu(ctx) {
  const { user, isAdmin } = ctx.state;
  const firstName = escapeMarkdown(ctx.from.first_name || 'Valued Customer');

  if (isAdmin) {
    const adminText = `🛠️ **Admin Dashboard**\nWelcome back, Administrator.`;

    const adminKeyboard = Markup.inlineKeyboard([
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
        Markup.button.callback('👥 Users', 'admin_list_users_0')
      ],
      [
        Markup.button.callback('🚫 Frozen Accounts', 'admin_frozen_list'),
        Markup.button.callback('🏆 Highest Buyers', 'admin_top_buyers')
      ],
      [
        Markup.button.callback('💾 Export Database', 'admin_export_db'),
        Markup.button.callback('⚙️ Settings', 'admin_settings')
      ]
    ]);

    if (ctx.callbackQuery) {
      return ctx.editMessageText(adminText, { parse_mode: 'Markdown', ...adminKeyboard }).catch(() => {});
    }
    return ctx.replyWithMarkdown(adminText, adminKeyboard);
  }

  const formattedBalance = Number(user.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const buyerText = 
    `🛍️ **Welcome to AssetFlow, ${firstName}!**\n` +
    `Your premium digital asset marketplace for social media accounts, subscriptions, and digital tools.\n\n` +
    `💳 **Your Wallet Balance:** \`$${formattedBalance}\`\n\n` +
    `Select an option below to start shopping or manage your account:`;

  const buyerKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🛒 Browse Marketplace', 'buyer_catalog'),
      Markup.button.callback('💳 Deposit Wallet', 'buyer_deposit')
    ],
    [
      Markup.button.callback('📦 My Orders (Vault)', 'buyer_orders'),
      Markup.button.callback('⭐ Favorites', 'buyer_favorites')
    ],
    [
      Markup.button.callback('👥 Affiliate & VIP', 'buyer_referral'),
      Markup.button.callback('🎧 Customer Support', 'buyer_support')
    ]
  ]);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(buyerText, { parse_mode: 'Markdown', ...buyerKeyboard }).catch(() => {});
  }
  return ctx.replyWithMarkdown(buyerText, buyerKeyboard);
}

module.exports = (bot) => {
  bot.start(sendHomeMenu);
  bot.action('home_menu', sendHomeMenu);
};
