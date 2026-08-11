const config = require('../config');
const dbService = require('../database/dbService');
const logger = require('../utils/logger');

// Helper to ensure admin privileges
const ensureAdmin = (ctx) => {
  if (!ctx.state.isAdmin) {
    logger.warn(`Unauthorized admin attempt by user ${ctx.from.id}`);
    ctx.reply('❌ Unauthorized: You do not have administrator privileges.');
    return false;
  }
  return true;
};

module.exports = async (ctx, next) => {
  if (!ctx.from) return next();

  const telegramId = ctx.from.id;
  const isAdmin = config.adminIds.includes(telegramId);

  try {
    let user = await dbService.getUser(telegramId);

    // Parse referral code if present on /start ref_123456
    let referrerId = null;
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/start ref_')) {
      const parts = ctx.message.text.split('ref_');
      if (parts[1] && !isNaN(parts[1])) {
        referrerId = Number(parts[1]);
        // Robust Self-Referral Check
        if (referrerId === telegramId) {
          logger.warn(`User ${telegramId} attempted self-referral.`);
          referrerId = null;
        }
      }
    }

    if (!user) {
      user = {
        telegram_id: telegramId,
        username: ctx.from.username || '',
        role: isAdmin ? 'admin' : 'buyer',
        balance: 0.00,
        total_spent: 0.00,
        referred_by: referrerId,
        is_frozen: false,
        favorites: []
      };
      await dbService.saveUser(user);
      logger.info(`Registered new ${user.role}: ${user.username || telegramId}`);
    } else {
      if (ctx.from.username && user.username !== ctx.from.username) {
        user.username = ctx.from.username;
        await dbService.saveUser(user);
      }
      
      // Update role if admin status changed
      if (isAdmin && user.role !== 'admin') {
        user.role = 'admin';
        await dbService.saveUser(user);
      }
    }

    ctx.state.user = user;
    ctx.state.isAdmin = isAdmin;
    ctx.state.ensureAdmin = () => ensureAdmin(ctx);

  } catch (err) {
    logger.error(`Auth Middleware Error for user ${telegramId}:`, err.message);
  }

  return next();
};
