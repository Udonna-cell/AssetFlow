const { Markup } = require('telegraf');
const smsService = require('./smsService');
const dbService = require('../database/dbService');
const logger = require('./logger');

const POLLING_INTERVAL_MS = 1000; // Poll every 1s for animation
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes total

/**
 * Robustly polls for SMS codes without relying on a transient request ctx
 */
async function startSmsPolling(bot, activationId, userId, price, chatId, messageId, formattedPhoneNumber) {
    const startTime = Date.now();
    const endTime = startTime + TIMEOUT_MS;

    logger.info(`Starting polling for activation ${activationId} (User: ${userId})`);

    // Helper to format MM:SS
    const formatTime = (ms) => {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    let lastApiPoll = 0;
    let animationFrame = 0;
    const animations = ['📡', '📡.', '📡..', '📡...'];

    const interval = setInterval(async () => {
        const now = Date.now();
        const timeLeft = Math.max(0, endTime - now);

        try {
            // 1. Timeout check
            if (timeLeft <= 0) {
                clearInterval(interval);
                await smsService.setStatus(activationId, -1); // Cancel
                await dbService.incrementUserBalance(userId, price); // Refund

                await bot.telegram.editMessageText(chatId, messageId, null, 
                    `⏰ **Timeout**\nNo code received within 5 minutes for ${formattedPhoneNumber}. Order cancelled and balance refunded.`, 
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('🔄 Get New Number', 'sms_buy_wa_confirmed')]
                        ]).reply_markup
                    }
                ).catch(e => logger.error(`Failed to send timeout msg: ${e.message}`));

                logger.info(`Polling timed out for activation ${activationId}`);
                return;
            }
            // 2. Poll API (only every 10 seconds to avoid spamming)
            if (now - lastApiPoll >= 10000) {
                lastApiPoll = now;
                const status = await smsService.getStatus(activationId);
                
                if (status.startsWith('STATUS_OK')) {
                    clearInterval(interval);
                    const code = status.split(':')[1];
                    await smsService.setStatus(activationId, 6); // Set as completed
                    
                    await bot.telegram.editMessageText(chatId, messageId, null, 
                        `🎉 **Code Received**\nNumber: ${formattedPhoneNumber}\nCode: \`${code}\``, 
                        { parse_mode: 'Markdown' }
                    ).catch(e => logger.error(`Failed to send code msg: ${e.message}`));
                    
                    logger.info(`Code successfully received for activation ${activationId}`);
                    return;
                }
            }

            // 3. Update the countdown message (every 1s)
            animationFrame = (animationFrame + 1) % animations.length;
            const animation = animations[animationFrame];

            await bot.telegram.editMessageText(chatId, messageId, null, 
                `✅ **Number Reserved**\nNumber: ${formattedPhoneNumber}\nWaiting for SMS code...\n⏱️ Time remaining: ${formatTime(timeLeft)}\n${animation}`,
                { parse_mode: 'Markdown' }
            ).catch(e => logger.warn(`Failed to update countdown msg: ${e.message}`));

        } catch (error) {
            logger.error(`Error in polling loop for activation ${activationId}:`, error);
        }
    }, POLLING_INTERVAL_MS);
}

module.exports = { startSmsPolling };
