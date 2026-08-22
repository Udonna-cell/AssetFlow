const { Markup } = require('telegraf');
const smsService = require('../../utils/smsService');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');
const smsPollingService = require('../../utils/smsPollingService');
const { escapeMarkdown } = require('../../utils/telegram');
const { parsePhoneNumber } = require('awesome-phonenumber');

const smsSessions = new Map();

module.exports = (bot) => {
  async function showCountryDetails(ctx, selectedCountry) {
      const priceWithIncrease = selectedCountry.price + 1;
        
      // Robust session assignment for next step
      if (!ctx.session) ctx.session = {};
      ctx.session.sms_country_id = selectedCountry.countryId;
      ctx.session.sms_country_name = selectedCountry.countryName;
      ctx.session.sms_dial_code = selectedCountry.dialCode;
      ctx.session.sms_service = 'wa';

      return ctx.reply(
          `✅ **Country ${selectedCountry.countryName} selected.**\n\n` +
          `💰 **Price:** \`$${priceWithIncrease.toFixed(2)}\`\n` +
          `📊 **Available Stock:** \`${selectedCountry.stock}\`\n\n` +
          `Ready to purchase?`,
          {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                  [Markup.button.callback('⚡ Buy Now', `sms_buy_wa_confirmed_with_increase`)],
                  [Markup.button.callback('🔙 Back', 'buyer_sms_services')]
              ])
          }
      );
  }

  bot.action('buyer_sms_services', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const text = `📱 **Activation Numbers**\nSelect a service to get started:`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💬 WhatsApp', 'buyer_sms_service_wa')],
      [Markup.button.callback('🔙 Back', 'buyer_catalog')]
    ]);
    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
  });

  bot.action('buyer_sms_service_wa', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    smsSessions.set(ctx.from.id, { step: 'AWAIT_WA_COUNTRY' });
    return ctx.editMessageText(`🌍 **WhatsApp Activation**\n\nPlease enter the name of the country:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'buyer_sms_services')]])
    });
  });

  // Listen for Country Input
  bot.on('text', async (ctx, next) => {
    const session = smsSessions.get(ctx.from.id);
    if (!session || session.step !== 'AWAIT_WA_COUNTRY') return next();

    const countryInput = ctx.message.text.trim().toLowerCase();
    smsSessions.delete(ctx.from.id);

    try {
        const countries = await smsService.getAvailableCountriesForService('wa');
        const selectedCountry = countries.find(c => c.countryName.toLowerCase() === countryInput);

        if (selectedCountry) {
            return await showCountryDetails(ctx, selectedCountry);
        }

        // Suggestions
        const matches = countries.filter(c => c.countryName.toLowerCase().includes(countryInput));
        if (matches.length > 0) {
            const buttons = matches.map(c => [
                Markup.button.callback(c.countryName, `sms_select_country_${c.countryId}`)
            ]);
            buttons.push([Markup.button.callback('❌ Cancel', 'buyer_sms_services')]);
            return ctx.reply(`❌ Country '${ctx.message.text}' not found. Did you mean?`, {
                ...Markup.inlineKeyboard(buttons)
            });
        }

        return ctx.reply(`❌ Country '${ctx.message.text}' not found or currently unavailable.`, {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'buyer_sms_services')]])
        });
    } catch (e) {
        logger.error('Error in WA country lookup:', e);
        return ctx.reply(`❌ An error occurred while checking availability.`);
    }
  });

  bot.action(/^sms_select_country_(\d+)$/, async (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const countryId = parseInt(ctx.match[1]);
      try {
          const countries = await smsService.getAvailableCountriesForService('wa');
          const selectedCountry = countries.find(c => c.countryId === countryId);
          if (!selectedCountry) {
              return ctx.reply('❌ Country no longer available.');
          }
          return await showCountryDetails(ctx, selectedCountry);
      } catch (e) {
          logger.error('Error in WA country selection:', e);
          return ctx.reply('❌ An error occurred.');
      }
  });

  bot.action('sms_buy_wa_confirmed_with_increase', async (ctx) => {
    ctx.answerCbQuery('Processing...').catch(() => {});
    
    try {
        const userId = ctx.from.id;
        const user = await dbService.getUser(userId);
        const countries = await smsService.getAvailableCountriesForService('wa');
        const selectedCountry = countries.find(c => c.countryId === parseInt(ctx.session?.sms_country_id));
        
        if (!selectedCountry) {
            return ctx.reply(`❌ Selected country no longer available (Session may have expired).`);
        }

        // Apply +1 increase here too
        const price = selectedCountry.price + 1;
        const balance = Number(user.balance || 0);

        if (balance < price) {
            return ctx.editMessageText(`❌ **Insufficient Balance**\n\nYou need \`$${price.toFixed(2)}\` but your balance is \`$${balance.toFixed(2)}\`.\n\nPlease fund your wallet to continue.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Fund Wallet', 'buyer_deposit')],
                    [Markup.button.callback('🔙 Back', 'buyer_sms_services')]
                ])
            });
        }

        // 1. Reserve number
        const response = await smsService.getNumber(ctx.session.sms_country_id, 'wa');
        if (!response.startsWith('ACCESS_NUMBER')) {
            return ctx.reply(`❌ Failed to reserve a number: ${response}`);
        }

        const [_, activationId, rawPhoneNumber] = response.split(':');
        
        // 2. Format phone number safely
        let formattedDisplay = `\`${rawPhoneNumber}\``; // Default fallback
        try {
            const phoneToFormat = String(rawPhoneNumber).startsWith('+') ? String(rawPhoneNumber) : `+${String(rawPhoneNumber)}`;
            
            // Extreme defense: only attempt formatting if it looks strictly numeric after +
            if (/^\+\d{7,15}$/.test(phoneToFormat)) {
                // Try-catch block specifically around library usage
                try {
                    const pn = parsePhoneNumber(phoneToFormat);

                    if (pn.valid) {
                        formattedDisplay = `+${pn.countryCode} \`${pn.number.national}\``;
                    } else {
                        logger.warn('Phone number format rejected for formatting:', phoneToFormat);
                    }
                } catch (libError) {
                    logger.warn('Library error, skipping formatting:', libError.message);
                }
            } else {
                logger.warn('Phone number format rejected for formatting:', phoneToFormat);
            }
        } catch (formatError) {
            logger.error('Error in phone formatting logic:', formatError);
        }
    
        // 3. Deduct balance
        user.balance = balance - price;
        await dbService.saveUser(user);

        // 4. Start Polling using the new service
        const message = await ctx.reply(`✅ **Number Reserved**\nNumber: ${formattedDisplay}\nWaiting for SMS code...`);

        await smsPollingService.startSmsPolling(
            bot,
            activationId,
            userId,
            price,
            ctx.chat.id,
            message.message_id,
            formattedDisplay
        );

    } catch (error) {
        logger.error('Error in sms_buy_wa_confirmed_with_increase:', error);
        return ctx.reply(`❌ An unexpected error occurred while processing your order.`);
    }
  });
};
