const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');
const config = require('../../config');
const adminNavigation = require('../../utils/adminNavigation');

const BANK_PRESETS = {
  acc_A: { bank: 'Moniepoint', number: '7044030978', name: 'Udochukwu Stanley Oeabueze' },
  acc_B: { bank: 'Kuda Bank', number: '2037973285', name: 'Udochukwu Stanley Oeabueze' },
  acc_C: { bank: 'Opay', number: '6548940324', name: 'Udochukwu Stanley Oeabueze' }
};

const depositsHandler = (bot) => {
  // 1. Pending Deposits Queue View
  bot.action('admin_deposits', async (ctx) => {
    adminNavigation.push(ctx, 'admin_deposits');
    ctx.answerCbQuery().catch(() => {});
    const pendingDeposits = await dbService.getPendingDeposits();

    if (!pendingDeposits || pendingDeposits.length === 0) {
      return ctx.editMessageText(
        `📥 **Pending Deposit Queue**\n━━━━━━━━━━━━━━━━━━━━\nNo pending deposits awaiting action.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Admin Home', 'admin_back')]])
        }
      ).catch(() => {});
    }

    let text = `📥 **Pending Deposits Queue (${pendingDeposits.length}):**\n━━━━━━━━━━━━━━━━━━━━\n`;
    const buttons = [];

    pendingDeposits.forEach((dep) => {
      text += `\n**#DEP-${dep.id}** | User: \`${dep.user_id}\` | Amount: **$${dep.amount}** | Status: \`${dep.status}\``;
      buttons.push([
        Markup.button.callback(`✅ Approve #DEP-${dep.id}`, `admin_approve_dep_${dep.id}`),
        Markup.button.callback(`❌ Reject #DEP-${dep.id}`, `admin_reject_dep_${dep.id}`)
      ]);
    });

    buttons.push([Markup.button.callback('🏠 Admin Home', 'admin_back')]);

    return ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }).catch(() => {});
  });

  // 2. Dispatch Selected Bank Preset to Buyer
  bot.action(/^admin_send_acc_(A|B|C)_(\d+)_(\d+)$/, async (ctx) => {
    adminNavigation.push(ctx, 'admin_send_acc_' + ctx.match[1] + '_' + ctx.match[2] + '_' + ctx.match[3]);
    ctx.answerCbQuery('Bank details sent to buyer!').catch(() => {});

    const presetKey = `acc_${ctx.match[1]}`;
    const depositId = ctx.match[2];
    const buyerMsgId = ctx.match[3];
    const bankInfo = BANK_PRESETS[presetKey];

    const deposit = await dbService.updateDepositBankDetails(
      depositId,
      `${bankInfo.bank} - ${bankInfo.number} (${bankInfo.name})`
    );

    if (!deposit) return;

    await ctx.editMessageText(
      `✅ **Bank Account Sent for #DEP-${depositId}**\n` +
      `Dispatched: ${bankInfo.bank} (${bankInfo.number})`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    const nairaAmount = (deposit.amount * config.usdToNgnRate).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    const buyerText = 
      `💳 **Dedicated Deposit Account Generated**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Transfer the **exact amount** below to complete your wallet top-up:\n\n` +
      `🏦 **Bank Name:** ${bankInfo.bank}\n` +
      `🔢 **Account Number:** \`${bankInfo.number}\`\n` +
      `👤 **Account Name:** ${bankInfo.name}\n` +
      `💵 **Exact Amount:** \`$${deposit.amount}\` (₦${nairaAmount})\n` +
      `⏱️ **Expires In:** 15:00 minutes\n\n` +
      `⚠️ *Make sure to transfer the exact amount so our bank node auto-reconciles your deposit.*`;

    const buyerKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ I Have Completed Payment', `buyer_paid_${depositId}`)],
      [Markup.button.callback('❌ Cancel Deposit', 'admin_back')]
    ]);

    bot.telegram.editMessageText(deposit.user_id, buyerMsgId, null, buyerText, {
      parse_mode: 'Markdown',
      ...buyerKeyboard
    }).catch((err) => {
      logger.error(`Could not update message for buyer ${deposit.user_id}:`, err.message);
    });
  });

  // 3. Admin Approves Payment & Credits Wallet
  bot.action(/^admin_approve_dep_(\d+)$/, async (ctx) => {
    adminNavigation.push(ctx, 'admin_approve_dep_' + ctx.match[1]);
    ctx.answerCbQuery('Deposit Approved & Credited!').catch(() => {});

    const depositId = ctx.match[1];
    const deposit = await dbService.updateDepositStatus(depositId, 'approved');

    if (!deposit) return;

    const updatedUser = await dbService.incrementUserBalance(deposit.user_id, deposit.amount);

    await ctx.editMessageText(
      `✅ **DEPOSIT #DEP-${depositId} APPROVED**\n` +
      `Credited **$${deposit.amount}** to User \`${deposit.user_id}\`.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    const formattedBal = Number(updatedUser.balance).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const successMsg = 
      `🎉 **Deposit Successful!**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 **Amount Credited:** \`$${deposit.amount}\`\n` +
      `💳 **New Balance:** \`$${formattedBal}\`\n\n` +
      `Thank you for funding your wallet! You can now resume shopping.`;

    bot.telegram.sendMessage(deposit.user_id, successMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🛒 Browse Marketplace', 'buyer_catalog')]])
    }).catch(() => {});
  });

  // 4. Admin Rejects Payment Request
  bot.action(/^admin_reject_dep_(\d+)$/, async (ctx) => {
    adminNavigation.push(ctx, 'admin_reject_dep_' + ctx.match[1]);
    ctx.answerCbQuery('Deposit Rejected.').catch(() => {});

    const depositId = ctx.match[1];
    const deposit = await dbService.updateDepositStatus(depositId, 'rejected');

    await ctx.editMessageText(
      `❌ **DEPOSIT #DEP-${depositId} REJECTED**`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    if (deposit) {
      const failMsg = 
        `⚠️ **Verification Unsuccessful (#DEP-${depositId})**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `We could not verify a matching deposit of **$${deposit.amount}** on our ledger.\n\n` +
        `If you were debited, please contact support with your receipt.`;

      bot.telegram.sendMessage(deposit.user_id, failMsg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🎧 Customer Support', 'buyer_support')]])
      }).catch(() => {});
    }
  });

  // Cancel Request Action
  bot.action(/^admin_cancel_dep_(\d+)_(\d+)$/, async (ctx) => {
    adminNavigation.push(ctx, 'admin_cancel_dep_' + ctx.match[1] + '_' + ctx.match[2]);
    ctx.answerCbQuery('Deposit cancelled.').catch(() => {});

    const depositId = ctx.match[1];
    await dbService.updateDepositStatus(depositId, 'rejected');
    ctx.editMessageText(`❌ Deposit #DEP-${depositId} cancelled.`).catch(() => {});
  });
};

module.exports = depositsHandler;
module.exports.BANK_PRESETS = BANK_PRESETS;
