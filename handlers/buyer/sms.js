const { Markup } = require('telegraf');
const smsService = require('../../utils/smsService');
const dbService = require('../../database/dbService');
const { escapeMarkdown } = require('../../utils/telegram');
const AsYouType = require('awesome-phonenumber');

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

    // Save selection in session
    ctx.session = { ...ctx.session, sms_country_id: countryId, sms_country_name: countryName, sms_dial_code: dialCode, sms_service: 'wa' };
    
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
    
    const userId = ctx.from.id;
    const user = await dbService.getUser(userId);
    const countries = await smsService.getAvailableCountriesForService('wa');
    const selectedCountry = countries.find(c => c.countryId === parseInt(ctx.session.sms_country_id));
    
    if (!selectedCountry) return ctx.reply(`❌ Selected country no longer available.`);

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
    
    // Format phone number using awesome-phonenumber
    // Ensure the number starts with '+' for proper parsing
    const phoneToFormat = rawPhoneNumber.startsWith('+') ? rawPhoneNumber : `+${rawPhoneNumber}`;
    const pn = new AsYouType(phoneToFormat);
    
    const formattedDisplay = pn.valid() 
        ? `${pn.getCountryCode()} \`${pn.getNumber('national')}\``.replace('+', '+') 
        : `\`${rawPhoneNumber}\``; // Fallback if invalid
    
    // 2. Deduct balance
    user.balance = balance - price;
    await dbService.saveUser(user);

    // 3. Start Polling
    const TIMEOUT_MS = 5 * 60 * 1000;
    let timeLeft = TIMEOUT_MS;
    
    const message = await ctx.reply(`✅ **Number Reserved**\nNumber: ${formattedDisplay}\nWaiting for SMS code...\n⏱️ Time remaining: ${Math.floor(timeLeft / 60000)}m ${Math.floor((timeLeft % 60000) / 1000)}s`);

    let pollCounter = 0;
    const interval = setInterval(async () => {
        timeLeft -= 1000;
        pollCounter += 1000;
        
        // Timeout check
        if (timeLeft <= 0) {
            clearInterval(interval);
            await smsService.setStatus(activationId, -1); // Cancel
            await dbService.incrementUserBalance(userId, price); // Refund
            return ctx.telegram.editMessageText(ctx.chat.id, message.message_id, null, `⏰ **Timeout**\nNo code received within 5 minutes for ${formattedDisplay}. Order cancelled and balance refunded.`, { parse_mode: 'Markdown' }).catch(() => {});
        }

        // Poll API every 10 seconds
        if (pollCounter >= 10000) {
            pollCounter = 0;
            const status = await smsService.getStatus(activationId);
            if (status.startsWith('STATUS_OK')) {
                clearInterval(interval);
                const code = status.split(':')[1];
                await smsService.setStatus(activationId, 6); // Set as completed
                return ctx.telegram.editMessageText(ctx.chat.id, message.message_id, null, `🎉 **Code Received**\nNumber: ${formattedDisplay}\nCode: \`${code}\``, { parse_mode: 'Markdown' }).catch(() => {});
            }
        }

        // Update the countdown message
        ctx.telegram.editMessageText(ctx.chat.id, message.message_id, null, 
          `✅ **Number Reserved**\nNumber: ${formattedDisplay}\nWaiting for SMS code...\n⏱️ Time remaining: ${Math.floor(timeLeft / 60000)}m ${Math.floor((timeLeft % 60000) / 1000)}s`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
    }, 1000); // Poll/Update every 1 second
  });
};
