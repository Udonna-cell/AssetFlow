const { Markup } = require('telegraf');
const smsService = require('../../utils/smsService');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');
const smsPollingService = require('../../utils/smsPollingService');
const { escapeMarkdown } = require('../../utils/telegram');
const { parsePhoneNumber } = require('awesome-phonenumber');

module.exports = (bot) => {
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
    
    try {
        const countries = await smsService.getAvailableCountriesForService('wa');
        if (countries.length === 0) {
            return ctx.editMessageText(`❌ No WhatsApp numbers available currently.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'buyer_sms_services')]])
            });
        }
        
        // Present a list of available countries
        const text = `🌍 **Select Country for WhatsApp**\nChoose one of the available countries below:`;
        
        // Sort by price ascending
        countries.sort((a, b) => a.price - b.price);
        
        const buttons = countries.map(c => [
            Markup.button.callback(`${c.countryName} - $${c.price.toFixed(2)} (${c.stock})`, `sms_country_wa_${c.countryId}`)
        ]);
        buttons.push([Markup.button.callback('❌ Cancel', 'buyer_sms_services')]);
        
        return ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    } catch (e) {
        return ctx.reply(`❌ Error fetching countries: ${e.message}`);
    }
  });

  bot.action(/^sms_country_wa_(\d+)$/, async (ctx) => {
    const countryId = ctx.match[1];
    ctx.answerCbQuery('Country selected. Proceeding...').catch(() => {});
    
    const countries = await smsService.getAvailableCountriesForService('wa');
    const selectedCountry = countries.find(c => c.countryId === parseInt(countryId));
    const countryName = selectedCountry ? selectedCountry.countryName : `ID ${countryId}`;
    const dialCode = selectedCountry ? selectedCountry.dialCode : '';

    // Robust session assignment
    if (!ctx.session) ctx.session = {};
    ctx.session.sms_country_id = countryId;
    ctx.session.sms_country_name = countryName;
    ctx.session.sms_dial_code = dialCode;
    ctx.session.sms_service = 'wa';
    
    return ctx.editMessageText(`✅ **Country ${countryName} selected.**\nReady to purchase?`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Buy Now', `sms_buy_wa_confirmed`)],
            [Markup.button.callback('🔙 Back', 'buyer_sms_services')]
        ])
    });
  });

  bot.action('sms_buy_wa_confirmed', async (ctx) => {
    ctx.answerCbQuery('Processing...').catch(() => {});
    
    try {
        const userId = ctx.from.id;
        const user = await dbService.getUser(userId);
        const countries = await smsService.getAvailableCountriesForService('wa');
        const selectedCountry = countries.find(c => c.countryId === parseInt(ctx.session?.sms_country_id));
        
        if (!selectedCountry) {
            return ctx.reply(`❌ Selected country no longer available (Session may have expired).`);
        }

        const price = selectedCountry.price;
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
        logger.error('Error in sms_buy_wa_confirmed:', error);
        return ctx.reply(`❌ An unexpected error occurred while processing your order.`);
    }
  });
};
