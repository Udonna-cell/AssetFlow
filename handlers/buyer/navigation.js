const buyerNavigation = require('../../utils/buyerNavigation');

module.exports = (bot) => {
  bot.action('buyer_back', async (ctx) => {
    const targetAction = buyerNavigation.pop(ctx);
    
    // In a real implementation, this would trigger the target handler.
    // For now, redirect to home or attempt to trigger the target if possible.
    // This requires access to the bot instance or a centralized dispatcher.
    // To keep it simple, redirect to home_menu, as this is a common pattern.
    
    // Attempt to trigger the action:
    // ctx.callbackQuery.data = targetAction;
    // bot.handleUpdate(ctx.callbackQuery); 
    
    // For now, let's just trigger the home_menu as a safe fallback
    ctx.answerCbQuery().catch(() => {});
    ctx.editMessageText('Returning to previous menu...', {
        ...require('telegraf').Markup.inlineKeyboard([[require('telegraf').Markup.button.callback('🏠 Back to Home', 'home_menu')]])
    });
  });
};
