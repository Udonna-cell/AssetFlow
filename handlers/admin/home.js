const adminHomeHandlers = require('../impl/admin_home');

module.exports = (bot) => {
  bot.command('admin', adminHomeHandlers.adminDashboard);
  bot.action(/admin_list_users_(\d+)/, adminHomeHandlers.listUsers);
  bot.action('admin_frozen_list', adminHomeHandlers.listFrozenAccounts);
  bot.action(/^admin_unfreeze_specific_(\d+)$/, adminHomeHandlers.unfreezeSpecific);
  bot.action(/^admin_freeze_(\d+)_(\d+)$/, adminHomeHandlers.freezeUser);
  bot.action(/^admin_credit_(\d+)_(\d+)$/, adminHomeHandlers.creditUser);
  bot.action(/^admin_dm_(\d+)_(\d+)$/, adminHomeHandlers.dmUser);
  bot.on('text', adminHomeHandlers.handleTextInput);
  bot.action('admin_top_buyers', adminHomeHandlers.topBuyers);
  bot.action('admin_export_db', adminHomeHandlers.exportDatabaseAction);
  bot.action('admin_home', adminHomeHandlers.backToHome);
  bot.action('admin_back', adminHomeHandlers.adminBack);
};
