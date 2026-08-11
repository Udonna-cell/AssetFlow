const { Telegraf } = require('telegraf');
const config = require('./config');
const dbService = require('./database/dbService');
const logger = require('./utils/logger');

// Import Middleware & Handlers
const authMiddleware = require('./middleware/auth');
const registerStartHandler = require('./handlers/start');
const registerBuyerDeposit = require('./handlers/buyer/deposit');
const registerAdminDeposits = require('./handlers/admin/deposits');
const registerBuyerCatalog = require('./handlers/buyer/catalog');
const registerAdminInventory = require('./handlers/admin/inventory');
const registerBuyerSupport = require('./handlers/buyer/support');
const registerAdminSupport = require('./handlers/admin/support');
const registerAdminBroadcasts = require('./handlers/admin/broadcasts');
const registerBuyerOrders = require('./handlers/buyer/orders');
const registerBuyerFavorites = require('./handlers/buyer/favorites');
const registerBuyerReferral = require('./handlers/buyer/referral');
const registerAdminAnalytics = require('./handlers/admin/analytics');
const registerAdminHome = require('./handlers/admin/home');

if (!config.botToken) {
  logger.error('BOT_TOKEN missing in .env file! Exiting process...');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);

// Catch all Telegraf bot execution errors globally
bot.catch((err, ctx) => {
  logger.warn(`Handled Telegram Error for update ${ctx.updateType}:`, err.message || err);
});

async function bootstrap() {
  logger.info('Initializing AssetFlow Telegram Bot...');

  // Initialize Database Service
  await dbService.init();

  // Middleware
  bot.use(authMiddleware);

  // Register Handlers
  registerStartHandler(bot);
  registerBuyerDeposit(bot);
  registerAdminDeposits(bot);
  registerBuyerCatalog(bot);
  registerAdminInventory(bot);
  registerBuyerSupport(bot);
  registerAdminSupport(bot);
  registerAdminBroadcasts(bot);
  registerBuyerOrders(bot);
  registerBuyerFavorites(bot);
  registerBuyerReferral(bot);
  registerAdminAnalytics(bot);
  registerAdminHome(bot);

  // Launch Bot
  bot.launch()
    .then(() => {
      logger.info('🚀 AssetFlow Bot is online and listening!');
    })
    .catch((err) => {
      logger.error('Failed to launch Telegraf bot:', err.message);
    });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

bootstrap();
