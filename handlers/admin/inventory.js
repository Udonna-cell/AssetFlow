const { Markup } = require('telegraf');
const dbService = require('../../database/dbService');
const logger = require('../../utils/logger');
const config = require('../../config');

// Session store for multi-step admin creation wizards
const adminSessions = new Map();

module.exports = (bot) => {
  // 1. Admin Inventory Dashboard
  bot.action('admin_inventory', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    adminSessions.delete(ctx.from.id); // Clear lingering wizard sessions

    try {
      const categories = await dbService.getCategories();
      const products = await dbService.getAllProducts();

      const text = 
        `📦 **Admin Inventory Management**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📁 **Total Categories:** \`${categories.length}\`\n` +
        `🛍️ **Total Products:** \`${products.length}\`\n\n` +
        `Select an action below to manage your catalog:`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Add Category', 'admin_add_category'),
          Markup.button.callback('➕ Add Product', 'admin_add_product')
        ],
        [
          Markup.button.callback('📥 Refill Stock', 'admin_refill_stock'),
          Markup.button.callback('📋 View All Stock', 'admin_view_stock')
        ],
        [
          Markup.button.callback('✏️ Edit Product', 'admin_edit_prod_list'),
          Markup.button.callback('🗑️ Remove Category / Product', 'admin_delete_menu')
        ],
        [Markup.button.callback('🏠 Admin Home', 'home_menu')]
      ]);

      if (ctx.callbackQuery) {
        return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
      }
      return ctx.replyWithMarkdown(text, keyboard);
    } catch (err) {
      logger.error('Error in admin_inventory handler:', err);
      ctx.reply('⚠️ An error occurred while loading the inventory.').catch(() => {});
    }
  });

  // -------------------------------------------------------------
  // 2. ADD CATEGORY WIZARD
  // -------------------------------------------------------------
  bot.action('admin_add_category', (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    adminSessions.set(ctx.from.id, { step: 'ADD_CATEGORY_NAME' });

    ctx.replyWithMarkdown(
      `📁 **Create New Category**\n━━━━━━━━━━━━━━━━━━━━\n` +
      `Please reply with the **Category Name** (e.g., \`Netflix\`, \`Aged Twitter/X\`, \`Telegram Premium\`):`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_inventory')]])
    );
  });

  // -------------------------------------------------------------
  // 3. ADD PRODUCT WIZARD
  // -------------------------------------------------------------
  bot.action('admin_add_product', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const categories = await dbService.getCategories();

    if (!categories || categories.length === 0) {
      return ctx.editMessageText(
        `⚠️ **No Categories Found!**\n\nYou must create at least one category before adding products.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('➕ Create Category First', 'admin_add_category')],
            [Markup.button.callback('🔙 Back', 'admin_inventory')]
          ])
        }
      ).catch(() => {});
    }

    const buttons = categories.map(cat => [
      Markup.button.callback(`📁 ${cat.name}`, `admin_select_cat_${cat.id}`)
    ]);
    buttons.push([Markup.button.callback('❌ Cancel', 'admin_inventory')]);

    ctx.editMessageText(
      `📁 **Select Category for New Product:**\nChoose where to place this product:`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    ).catch(() => {});
  });

  // Select Category for Product Creation
  bot.action(/^admin_select_cat_(\d+)$/, (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const categoryId = ctx.match[1];
    adminSessions.set(ctx.from.id, { step: 'ADD_PROD_TITLE', categoryId });

    ctx.replyWithMarkdown(
      `📝 **Step 1/3: Product Title**\n` +
      `Send the name of the new product (e.g., \`1-Month Premium Account\` or \`2019 Aged Account\`):`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_inventory')]])
    );
  });

  // -------------------------------------------------------------
  // 5. REFILL STOCK WIZARDS
  // -------------------------------------------------------------
  bot.action('admin_view_stock', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const products = await dbService.getAllProducts();

    if (!products || products.length === 0) {
      return ctx.editMessageText(
        `⚠️ **No products found.**`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'admin_inventory')]]) }
      ).catch(() => {});
    }

    let text = `📋 **Current Inventory Stock:**\n━━━━━━━━━━━━━━━━━━━━\n`;
    products.forEach(p => {
      text += `• ${p.title}: \`${p.stock_count || 0}\` in stock\n`;
    });

    ctx.editMessageText(
      text,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'admin_inventory')]]) }
    ).catch(() => {});
  });

  // -------------------------------------------------------------
  // 6. DELETE CATEGORY / PRODUCT
  // -------------------------------------------------------------
  bot.action('admin_delete_menu', (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    ctx.editMessageText(
      `🗑️ **What would you like to delete?**`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📁 Delete Category', 'admin_list_del_cat')],
          [Markup.button.callback('🛍️ Delete Product', 'admin_list_del_prod')],
          [Markup.button.callback('🔙 Back', 'admin_inventory')]
        ])
      }
    ).catch(() => {});
  });

  bot.action('admin_list_del_cat', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const categories = await dbService.getCategories();
    if (!categories || categories.length === 0) return ctx.reply('⚠️ No categories.');

    const buttons = categories.map(c => [Markup.button.callback(`❌ ${c.name}`, `admin_del_cat_${c.id}`)]);
    buttons.push([Markup.button.callback('🔙 Back', 'admin_delete_menu')]);

    ctx.editMessageText(`📁 **Select Category to Delete:**\n(Warning: Deletes all products in category)`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
  });

  bot.action(/^admin_del_cat_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    await dbService.deleteCategory(ctx.match[1]);
    ctx.reply('✅ Category deleted.');
    ctx.editMessageText('✅ Category deleted. Returning to inventory.', { ...Markup.inlineKeyboard([[Markup.button.callback('📦 Inventory', 'admin_inventory')]]) });
  });

  bot.action('admin_edit_prod_list', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const products = await dbService.getAllProducts();
    if (!products || products.length === 0) return ctx.reply('⚠️ No products.');

    const buttons = products.map(p => [Markup.button.callback(`✏️ ${p.title}`, `admin_edit_prod_${p.id}`)]);
    buttons.push([Markup.button.callback('🔙 Back', 'admin_inventory')]);

    ctx.editMessageText(`🛍️ **Select Product to Edit:**`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
  });

  bot.action(/^admin_edit_prod_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const productId = ctx.match[1];
    const product = await dbService.getProductById(productId);
    
    adminSessions.set(ctx.from.id, { step: 'EDIT_PROD_CHOOSE_FIELD', productId });

    ctx.editMessageText(
      `✏️ **Editing "${product.title}"**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Current Details:\n` +
      `• Title: ${product.title}\n` +
      `• Price: $${product.price}\n` +
      `• Description: ${product.description || 'None'}\n\n` +
      `What would you like to edit?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📝 Title', `admin_edit_field_${productId}_title`)],
        [Markup.button.callback('💵 Price', `admin_edit_field_${productId}_price`)],
        [Markup.button.callback('📝 Description', `admin_edit_field_${productId}_description`)],
        [Markup.button.callback('🔙 Back', 'admin_edit_prod_list')]
      ])
    );
  });

  bot.action(/^admin_edit_field_(\d+)_(title|price|description)$/, (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const productId = ctx.match[1];
    const field = ctx.match[2];
    adminSessions.set(ctx.from.id, { step: 'EDIT_PROD_INPUT', productId, field });

    ctx.replyWithMarkdown(
      `Enter the new ${field} for the product:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_inventory')]])
    );
  });

  bot.action('admin_list_del_prod', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const products = await dbService.getAllProducts();
    if (!products || products.length === 0) return ctx.reply('⚠️ No products.');

    const buttons = products.map(p => [Markup.button.callback(`❌ ${p.title}`, `admin_del_prod_${p.id}`)]);
    buttons.push([Markup.button.callback('🔙 Back', 'admin_delete_menu')]);

    ctx.editMessageText(`🛍️ **Select Product to Delete:**`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
  });

  bot.action(/^admin_del_prod_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    await dbService.deleteProduct(ctx.match[1]);
    ctx.reply('✅ Product deleted.');
    ctx.editMessageText('✅ Product deleted. Returning to inventory.', { ...Markup.inlineKeyboard([[Markup.button.callback('📦 Inventory', 'admin_inventory')]]) });
  });

  bot.action('admin_refill_stock', async (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const products = await dbService.getAllProducts();
    if (!products || products.length === 0) {
      return ctx.editMessageText(
        `⚠️ **No products found to refill.**`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'admin_inventory')]]) }
      ).catch(() => {});
    }

    const buttons = products.map(p => [
      Markup.button.callback(`${p.title} (${p.stock_count || 0})`, `admin_refill_prod_${p.id}`)
    ]);
    buttons.push([Markup.button.callback('🔙 Back', 'admin_inventory')]);

    ctx.editMessageText(
      `📦 **Select Product to Refill:**`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    ).catch(() => {});
  });

  bot.action(/^admin_refill_prod_(\d+)$/, (ctx) => {
    ctx.answerCbQuery().catch(() => {});
    const productId = ctx.match[1];
    adminSessions.set(ctx.from.id, { step: 'REFILL_CREDENTIALS', productId });

    ctx.replyWithMarkdown(
      `📥 **Refill Stock**\n` +
      `Please enter the stock credentials (one per line, e.g., \`user:pass\`):`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_inventory')]])
    );
  });

  // -------------------------------------------------------------
  // 4. MULTI-STEP TEXT INPUT LISTENER (FOR CATEGORIES & PRODUCTS)
  // -------------------------------------------------------------
  bot.on('text', async (ctx, next) => {
    const session = adminSessions.get(ctx.from.id);
    if (!session) return next();

    // --- STEP A: CREATING CATEGORY ---
    if (session.step === 'ADD_CATEGORY_NAME') {
      const categoryName = ctx.message.text.trim();
      if (!categoryName) return ctx.reply('⚠️ Category name cannot be empty.');

      await dbService.createCategory(categoryName);
      adminSessions.delete(ctx.from.id);

      return ctx.replyWithMarkdown(
        `✅ Category **"${categoryName}"** created successfully!`,
        Markup.inlineKeyboard([
          [Markup.button.callback('➕ Add Product Now', 'admin_add_product')],
          [Markup.button.callback('📦 Back to Inventory', 'admin_inventory')]
        ])
      );
    }

    // --- STEP B1: PRODUCT TITLE ---
    if (session.step === 'ADD_PROD_TITLE') {
      const title = ctx.message.text.trim();
      if (!title) return ctx.reply('⚠️ Product title cannot be empty.');

      session.title = title;
      session.step = 'ADD_PROD_PRICE';
      adminSessions.set(ctx.from.id, session);

      return ctx.replyWithMarkdown(
        `💵 **Step 2/3: Product Price**\n` +
        `Enter the price in USD for **"${title}"** (e.g., \`5.00\` or \`12.50\`):`
      );
    }

    // --- STEP B2: PRODUCT PRICE ---
    if (session.step === 'ADD_PROD_PRICE') {
      const price = parseFloat(ctx.message.text.trim());
      if (isNaN(price) || price <= 0) {
        return ctx.reply('⚠️ Invalid price! Please enter a valid number greater than 0 (e.g., 4.99 or 15):');
      }

      session.price = price;
      session.step = 'ADD_PROD_DESC';
      adminSessions.set(ctx.from.id, session);

      return ctx.replyWithMarkdown(
        `📝 **Step 3/3: Product Description**\n` +
        `Enter details or warranty terms for **"${session.title}"** (or type \`none\` to skip):`
      );
    }

    // --- STEP B3: PRODUCT DESCRIPTION & FINAL SAVE ---
    if (session.step === 'ADD_PROD_DESC') {
      const descInput = ctx.message.text.trim();
      const description = descInput.toLowerCase() === 'none' ? '' : descInput;

      const productId = await dbService.createProduct({
        category_id: session.categoryId,
        title: session.title,
        price: session.price,
        description: description,
        warranty_hours: 24
      });

      adminSessions.delete(ctx.from.id);

      return ctx.replyWithMarkdown(
        `🎉 **Product Created Successfully!**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📦 **Title:** ${session.title}\n` +
        `💵 **Price:** \`$${session.price.toFixed(2)}\`\n` +
        `📝 **Description:** ${description || 'None'}\n\n` +
        `💡 *Next Step:* Upload stock credentials so buyers can purchase this item.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📥 Refill Stock Now', `admin_refill_prod_${productId}`)],
          [Markup.button.callback('📦 Inventory Menu', 'admin_inventory')]
        ])
      );
    }

    // --- STEP C: REFILL STOCK ---
    if (session.step === 'REFILL_CREDENTIALS') {
      const lines = ctx.message.text.trim().split('\n').filter(line => line.trim() !== '');
      if (lines.length === 0) return ctx.reply('⚠️ Please provide at least one credential.');

      await dbService.addStockItems(session.productId, lines);
      const product = await dbService.getProductById(session.productId);
      const subscribers = await dbService.getRestockSubscribers(session.productId);

      subscribers.forEach(userId => {
        bot.telegram.sendMessage(userId, `🔔 **Restock Alert**\nProduct "${product.title}" is now back in stock!`, Markup.inlineKeyboard([
          [Markup.button.callback('⚡ View Product', `prod_view_${session.productId}`)]
        ])).catch((err) => {
          logger.error(`Failed to send restock alert to buyer ${userId}:`, err.message);
        });
      });

      adminSessions.delete(ctx.from.id);

      return ctx.replyWithMarkdown(
        `✅ Successfully added **${lines.length}** item(s) to stock!`,
        Markup.inlineKeyboard([[Markup.button.callback('📦 Inventory Menu', 'admin_inventory')]])
      );
    }

    // --- STEP D: EDIT PRODUCT FIELD ---
    if (session.step === 'EDIT_PROD_INPUT') {
      const newValue = ctx.message.text.trim();
      const updates = {};
      updates[session.field] = session.field === 'price' ? parseFloat(newValue) : newValue;
      
      if (session.field === 'price' && isNaN(updates.price)) return ctx.reply('⚠️ Invalid price.');

      await dbService.updateProduct(session.productId, updates);
      adminSessions.delete(ctx.from.id);

      return ctx.replyWithMarkdown(
        `✅ Successfully updated **${session.field}**!`,
        Markup.inlineKeyboard([[Markup.button.callback('📦 Inventory Menu', 'admin_inventory')]])
      );
    }

    return next();
  });
};
