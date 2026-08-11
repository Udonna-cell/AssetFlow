const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');
const config = require('../../config');

const userDepositSessions = new Map();

module.exports = (bot) => {
  // 1. Initiate Deposit Flow
  bot.action('buyer_deposit', async (ctx) => {
    const text = 
      `💳 **Wallet Top-Up (Automated Gateway)**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Enter the exact amount you wish to deposit to your wallet.\n\n` +
      `💡 *Type a custom amount or select a preset below:*`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('$10', 'dep_preset_10'),
        Markup.button.callback('$25', 'dep_preset_25'),
        Markup.button.callback('$50', 'dep_preset_50')
      ],
      [
        Markup.button.callback('$100', 'dep_preset_100'),
        Markup.button.callback('$250', 'dep_preset_250')
      ],
      [Markup.button.callback('🏠 Return to Main Menu', 'home_menu')]
    ]);

    userDepositSessions.set(ctx.from.id, { step: 'AWAITING_AMOUNT' });

    if (ctx.callbackQuery) {
      return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
    }
    return ctx.replyWithMarkdown(text, keyboard);
  });

  // 2. Handle Quick Presets
  const presets = [10, 25, 50, 100, 250];
  presets.forEach((amount) => {
    bot.action(`dep_preset_${amount}`, async (ctx) => {
      userDepositSessions.delete(ctx.from.id);
      if (amount < 2) {
        return ctx.answerCbQuery('⚠️ Minimum deposit amount is $2.', { show_alert: true }).catch(() => {});
      }
      await processDepositRequest(ctx, amount);
    });
  });

  // 3. Handle Typed Custom Amount
  bot.on('text', async (ctx, next) => {
    const session = userDepositSessions.get(ctx.from.id);
    if (!session || session.step !== 'AWAITING_AMOUNT') return next();

    const amount = parseFloat(ctx.message.text.trim());
    if (isNaN(amount) || amount < 2) {
      return ctx.reply('⚠️ Please enter a valid numerical deposit amount. The minimum deposit is $2.');
    }

    userDepositSessions.delete(ctx.from.id);
    await processDepositRequest(ctx, amount);
  });

  // Create Deposit Record & Dispatch Masked System Prompt
  async function processDepositRequest(ctx, amount) {
    const userId = ctx.from.id;
    const deposit = await dbService.createDeposit(userId, amount);

    const loadingText = 
      `🔄 **Connecting to Secure Payment Gateway...**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Generating dedicated payment ledger details for Request #DEP-${deposit.id}...\n\n` +
      `⏱️ *Please hold on for a moment.*`;

    const loadingMsg = await ctx.replyWithMarkdown(loadingText);
    notifyAdminsNewDeposit(bot, ctx.from, deposit, loadingMsg.message_id);
  }

  // 4. Buyer Clicks "I Have Completed Payment"
  bot.action(/^buyer_paid_(\d+)$/, async (ctx) => {
    const depositId = ctx.match[1];
    await ctx.answerCbQuery('Payment claim submitted! Scanning ledger...');

    const verificationText = 
      `🔍 **Scanning Bank Ledger...**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `We are verifying your transfer with our automated bank node.\n\n` +
      `⏱️ *Verification usually takes 1–3 minutes. Your balance will update automatically upon confirmation.*`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Refresh Status', `buyer_check_status_${depositId}`)],
      [Markup.button.callback('🏠 Return to Home Menu', 'home_menu')]
    ]);

    await ctx.editMessageText(verificationText, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
    await dbService.updateDepositStatus(depositId, 'pending_verification');
    notifyAdminsClaimedPayment(bot, ctx.from, depositId);
  });

  // 5. Buyer Checks Payment Status
  bot.action(/^buyer_check_status_(\d+)$/, async (ctx) => {
    const depositId = ctx.match[1];
    const deposit = await dbService.getDepositById(depositId);

    if (!deposit) return ctx.answerCbQuery('⚠️ Deposit record not found.');

    if (deposit.status === 'approved') {
      ctx.answerCbQuery('🎉 Payment confirmed and credited!');
      return ctx.editMessageText(
        `🎉 **Deposit #DEP-${depositId} Approved!**\n\nYour wallet balance has been credited with **$${deposit.amount}**.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🛒 Browse Market', 'buyer_catalog')]])
        }
      ).catch(() => {});
    }

    if (deposit.status === 'rejected') {
      ctx.answerCbQuery('❌ Deposit verification failed.');
      return ctx.editMessageText(
        `❌ **Deposit #DEP-${depositId} Unsuccessful**\n\nWe could not verify your transfer. If you were debited, please contact support.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🎧 Customer Support', 'buyer_support')]])
        }
      ).catch(() => {});
    }

    ctx.answerCbQuery('Still pending verification... Please wait a moment.');
  });
};

// --- Notifications to Admin Dashboard ---
const { BANK_PRESETS } = require('../admin/deposits');

async function notifyAdminsNewDeposit(bot, buyer, deposit, buyerMsgId) {
  const nairaAmount = (deposit.amount * config.usdToNgnRate).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  const adminText = 
    `📥 **NEW DEPOSIT REQUEST #DEP-${deposit.id}**\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 **Buyer:** @${buyer.username || 'NoUsername'} (${buyer.id})\n` +
    `💵 **Amount:** $${deposit.amount} / ₦${nairaAmount}\n` +
    `🕒 **Time:** ${new Date().toLocaleTimeString()}\n\n` +
    `Select preset bank account details to send to buyer:`;

  const buttons = [
    [
      Markup.button.callback(`💳 A (${BANK_PRESETS.acc_A.bank})`, `admin_send_acc_A_${deposit.id}_${buyerMsgId}`),
      Markup.button.callback(`💳 B (${BANK_PRESETS.acc_B.bank})`, `admin_send_acc_B_${deposit.id}_${buyerMsgId}`),
      Markup.button.callback(`💳 C (${BANK_PRESETS.acc_C.bank})`, `admin_send_acc_C_${deposit.id}_${buyerMsgId}`)
    ],
    [Markup.button.callback('❌ Reject Request', `admin_cancel_dep_${deposit.id}_${buyerMsgId}`)]
  ];

  const keyboard = Markup.inlineKeyboard(buttons);

  config.adminIds.forEach((adminId) => {
    bot.telegram.sendMessage(adminId, adminText, { parse_mode: 'Markdown', ...keyboard }).catch((err) => {
      logger.error(`Failed to send deposit ping to admin ${adminId}:`, err.message);
    });
  });
}

async function notifyAdminsClaimedPayment(bot, buyer, depositId) {
  const deposit = await dbService.getDepositById(depositId);
  const nairaAmount = (deposit.amount * config.usdToNgnRate).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  
  const adminText = 
    `🛎️ **PAYMENT CLAIMED for #DEP-${depositId}!**\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 **Buyer:** @${buyer.username || 'NoUsername'} (${buyer.id})\n` +
    `💵 **Amount:** $${deposit.amount} / ₦${nairaAmount}\n` +
    `📌 *Buyer clicked "I Have Paid".* Please check your bank app!\n\n` +
    `Confirm approval to credit wallet immediately:`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Approve & Credit', `admin_approve_dep_${depositId}`),
      Markup.button.callback('❌ Reject Payment', `admin_reject_dep_${depositId}`)
    ]
  ]);

  config.adminIds.forEach((adminId) => {
    bot.telegram.sendMessage(adminId, adminText, { parse_mode: 'Markdown', ...keyboard }).catch((err) => {
      logger.error(`Failed to alert admin ${adminId}:`, err.message);
    });
  });
}
