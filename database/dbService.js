const dbConfigurator = require('../config/database');
const jsonEngine = require('./jsonEngine');
const logger = require('../utils/logger');
const generateSqlDump = require('../utils/sqlExporter');
const config = require('../config');

class DatabaseService {
  constructor() {
    this.isPrimaryConnected = false;
    this.pool = null;
  }

  async init() {
    // 1. Get settings from the environment initially, 
    // we cannot use `this.getSetting` yet as DB is not initialized.
    let dbConfig = { ...config.mysql };

    // This is tricky: we need to connect to the DB to fetch DB settings to connect to the DB.
    // For now, we connect with initial .env settings, then update the pool if needed.
    // Or we assume the .env settings are the "bootstrap" settings.
    
    this.pool = dbConfigurator.createPool(dbConfig);
    
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      this.isPrimaryConnected = true;
      logger.info('Connected to MySQL Primary Database successfully.');
    } catch (err) {
      this.isPrimaryConnected = false;
      logger.warn(`MySQL connection failed (${err.message}). Activating local JSON fallback engine.`);
    }
  }

  // Helper to execute queries using this.pool
  async execute(sql, params) {
    if (!this.pool) throw new Error('Database not initialized');
    return this.pool.execute(sql, params);
  }
  
  async query(sql, params) {
    if (!this.pool) throw new Error('Database not initialized');
    return this.pool.query(sql, params);
  }

  async getConnection() {
      if (!this.pool) throw new Error('Database not initialized');
      return this.pool.getConnection();
  }

  // --- USER & REFERRAL OPERATIONS ---
  async getUser(telegramId) {
    if (this.isPrimaryConnected) {
      try {
        const [ rows ] = await this.pool.execute('SELECT * FROM users WHERE telegram_id = ?', [ telegramId ]);
        if (rows.length > 0) {
          const user = rows[ 0 ];
          if (typeof user.favorites === 'string') {
            try { user.favorites = JSON.parse(user.favorites); } catch (e) { user.favorites = []; }
          }
          return user;
        }
        return null;
      } catch (err) {
        logger.error('MySQL getUser failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.findUser(telegramId);
  }

  async saveUser(userData) {
    const { telegram_id, username, role, balance, total_spent, referred_by, is_frozen, favorites } = userData;
    const favsJson = JSON.stringify(favorites || []);

    if (this.isPrimaryConnected) {
      try {
        const query = `
          INSERT INTO users (telegram_id, username, role, balance, total_spent, referred_by, is_frozen, favorites)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            role = VALUES(role),
            balance = VALUES(balance),
            total_spent = VALUES(total_spent),
            referred_by = VALUES(referred_by),
            is_frozen = VALUES(is_frozen),
            favorites = VALUES(favorites)
        `;
        await this.pool.execute(query, [
          telegram_id,
          username || '',
          role || 'buyer',
          balance || 0.00,
          total_spent || 0.00,
          referred_by || null,
          is_frozen ? 1 : 0,
          favsJson
        ]);
        return userData;
      } catch (err) {
        logger.error('MySQL saveUser failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.saveUser(userData);
  }

  async toggleUserFreeze(telegramId) {
    const user = await this.getUser(telegramId);
    if (!user) return null;

    // Ensure is_frozen is a boolean
    user.is_frozen = !(!!user.is_frozen);
    await this.saveUser(user);
    return user.is_frozen;
  }

  async getVIPInfo(user) {
    const spent = Number(user.total_spent || 0);
    let tier = '🥉 Bronze Buyer';
    let discountPercent = 0;

    if (spent >= 500) {
      tier = '🥇 Gold VIP';
      discountPercent = 10;
    } else if (spent >= 150) {
      tier = '🥈 Silver VIP';
      discountPercent = 5;
    }

    return { tier, discountPercent, totalSpent: spent };
  }

  async incrementUserBalance(telegramId, amount) {
    logger.info(`Incrementing balance for user ${telegramId} by ${amount}`);
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute('UPDATE users SET balance = balance + ? WHERE telegram_id = ?', [ amount, telegramId ]);
        return this.getUser(telegramId);
      } catch (err) {
        logger.error('MySQL incrementUserBalance failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.updateUserBalance(telegramId, amount);
  }

  // --- CATEGORIES & PRODUCTS ---
  async getCategories() {
    if (this.isPrimaryConnected) {
      try {
        const [ rows ] = await this.pool.execute('SELECT * FROM categories ORDER BY id DESC');
        return rows;
      } catch (err) {
        logger.error('MySQL getCategories failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return db.categories || [];
  }

  async createCategory(name, description = '') {
    if (this.isPrimaryConnected) {
      try {
        const [ res ] = await this.pool.execute('INSERT INTO categories (name, description) VALUES (?, ?)', [ name, description ]);
        return res.insertId;
      } catch (err) {
        logger.error('MySQL createCategory failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    const newCat = { id: db.categories.length + 1, name, description };
    db.categories = db.categories || [];
    db.categories.push(newCat);
    await jsonEngine.write(db);
    return newCat.id;
  }

  async createProduct({ category_id, title, price, description, warranty_hours }) {
    if (this.isPrimaryConnected) {
      try {
        const [ res ] = await this.pool.execute(
          'INSERT INTO products (category_id, title, price, description, warranty_hours) VALUES (?, ?, ?, ?, ?)',
          [ category_id, title, price, description || '', warranty_hours || 24 ]
        );
        return res.insertId;
      } catch (err) {
        logger.error('MySQL createProduct failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    db.products = db.products || [];
    const newProd = {
      id: db.products.length + 1,
      category_id: Number(category_id),
      title,
      price: Number(price),
      description: description || '',
      warranty_hours: Number(warranty_hours || 24),
      likes_count: 0
    };
    db.products.push(newProd);
    await jsonEngine.write(db);
    return newProd.id;
  }

  async getProductsByCategory(categoryId) {
    if (this.isPrimaryConnected) {
      try {
        const query = `
          SELECT p.*, COUNT(s.id) AS stock_count
          FROM products p
          LEFT JOIN stock_items s ON p.id = s.product_id AND s.is_sold = FALSE
          WHERE p.category_id = ?
          GROUP BY p.id
        `;
        const [ rows ] = await this.pool.execute(query, [ categoryId ]);
        return rows;
      } catch (err) {
        logger.error('MySQL getProductsByCategory failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return (db.products || [])
      .filter(p => Number(p.category_id) === Number(categoryId))
      .map(p => {
        const stockCount = (db.stockItems || []).filter(s => Number(s.product_id) === Number(p.id) && !s.is_sold).length;
        return { ...p, stock_count: stockCount };
      });
  }

  async getAllProducts() {
    if (this.isPrimaryConnected) {
      try {
        const query = `
          SELECT p.*, COUNT(s.id) AS stock_count
          FROM products p
          LEFT JOIN stock_items s ON p.id = s.product_id AND s.is_sold = FALSE
          GROUP BY p.id
        `;
        const [ rows ] = await this.pool.execute(query);
        return rows;
      } catch (err) {
        logger.error('MySQL getAllProducts failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return (db.products || []).map(p => {
      const stockCount = (db.stockItems || []).filter(s => Number(s.product_id) === Number(p.id) && !s.is_sold).length;
      return { ...p, stock_count: stockCount };
    });
  }

  async getProductById(productId) {
    if (this.isPrimaryConnected) {
      try {
        const query = `
          SELECT p.*, COUNT(s.id) AS stock_count
          FROM products p
          LEFT JOIN stock_items s ON p.id = s.product_id AND s.is_sold = FALSE
          WHERE p.id = ?
          GROUP BY p.id
        `;
        const [ rows ] = await this.pool.execute(query, [ productId ]);
        if (rows.length > 0) return rows[ 0 ];
      } catch (err) {
        logger.error('MySQL getProductById failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    const product = (db.products || []).find(p => Number(p.id) === Number(productId));
    if (!product) return null;

    const stockCount = (db.stockItems || []).filter(s => Number(s.product_id) === Number(product.id) && !s.is_sold).length;
    return { ...product, stock_count: stockCount };
  }

  async addStockItems(productId, itemsArray) {
    if (this.isPrimaryConnected) {
      try {
        const values = itemsArray.map(item => [ productId, item, false ]);
        await this.pool.query('INSERT INTO stock_items (product_id, credentials_data, is_sold) VALUES ?', [ values ]);
      } catch (err) {
        logger.error('MySQL addStockItems failed:', err.message);
        throw err;
      }
    } else {
      const db = await jsonEngine.read();
      itemsArray.forEach(data => {
        db.stockItems.push({
          id: db.stockItems.length + 1,
          product_id: Number(productId),
          credentials_data: data,
          is_sold: false
        });
      });
      await jsonEngine.write(db);
    }

    // Trigger Restock Notification logic
    const subscribers = await this.getRestockSubscribers(productId);
    return { subscribers };
  }

  // --- RESTOCK NOTIFICATION SUBSCRIPTIONS ---
  async toggleRestockSubscription(productId, userId) {
    const pId = Number(productId);
    const uId = Number(userId);

    if (this.isPrimaryConnected) {
      try {
        const [ rows ] = await this.pool.execute(
          'SELECT * FROM restock_subscriptions WHERE product_id = ? AND user_id = ?',
          [ pId, uId ]
        );

        if (rows.length > 0) {
          await this.pool.execute('DELETE FROM restock_subscriptions WHERE product_id = ? AND user_id = ?', [ pId, uId ]);
          return false;
        } else {
          await this.pool.execute('INSERT INTO restock_subscriptions (product_id, user_id) VALUES (?, ?)', [ pId, uId ]);
          return true;
        }
      } catch (err) {
        logger.error('MySQL toggleRestockSubscription failed:', err.message);
        throw err;
      }
    }

    const db = await jsonEngine.read();
    db.restock_subscriptions = db.restock_subscriptions || [];
    const index = db.restock_subscriptions.findIndex(s => Number(s.product_id) === pId && Number(s.user_id) === uId);

    if (index > -1) {
      db.restock_subscriptions.splice(index, 1);
      await jsonEngine.write(db);
      return false;
    } else {
      db.restock_subscriptions.push({ product_id: pId, user_id: uId });
      await jsonEngine.write(db);
      return true;
    }
  }

  async getRestockSubscribers(productId) {
    const pId = Number(productId);
    if (this.isPrimaryConnected) {
      try {
        const [ rows ] = await this.pool.execute('SELECT user_id FROM restock_subscriptions WHERE product_id = ?', [ pId ]);
        return rows.map(r => r.user_id);
      } catch (err) {
        logger.error('MySQL getRestockSubscribers failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return (db.restock_subscriptions || [])
      .filter(s => Number(s.product_id) === pId)
      .map(s => s.user_id);
  }

  // --- ATOMIC PURCHASE ENGINE (WITH VIP & REFERRAL BONUSES) ---
  async purchaseStockItem(productId, userId, rawPrice) {
    const user = await this.getUser(userId);

    if (user.is_frozen) {
      return { error: 'ACCOUNT_FROZEN' };
    }

    const { discountPercent } = await this.getVIPInfo(user);
    const finalPrice = rawPrice - (rawPrice * (discountPercent / 100));

    if (this.isPrimaryConnected) {
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();

        const [ stockRows ] = await connection.execute(
          'SELECT * FROM stock_items WHERE product_id = ? AND is_sold = FALSE LIMIT 1 FOR UPDATE',
          [ productId ]
        );

        if (stockRows.length === 0) {
          await connection.rollback();
          connection.release();
          return { error: 'OUT_OF_STOCK' };
        }

        const stockItem = stockRows[ 0 ];

        const [ userRows ] = await connection.execute(
          'SELECT balance, total_spent, referred_by FROM users WHERE telegram_id = ? FOR UPDATE',
          [ userId ]
        );

        if (userRows.length === 0 || Number(userRows[ 0 ].balance) < Number(finalPrice)) {
          await connection.rollback();
          connection.release();
          return { error: 'INSUFFICIENT_FUNDS' };
        }

        // Mark stock item as sold
        await connection.execute('UPDATE stock_items SET is_sold = TRUE WHERE id = ?', [ stockItem.id ]);

        // Deduct Balance and increment Total Spent
        await connection.execute(
          'UPDATE users SET balance = balance - ?, total_spent = total_spent + ? WHERE telegram_id = ?',
          [ finalPrice, finalPrice, userId ]
        );

        // Process Affiliate Referral Commission (5% of transaction to referrer)
        const referrerId = userRows[ 0 ].referred_by;
        if (referrerId) {
          const commission = finalPrice * 0.05;
          await connection.execute(
            'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
            [ commission, referrerId ]
          );
        }

        await connection.commit();
        connection.release();

        const updatedUser = await this.getUser(userId);

        return {
          success: true,
          credentials: stockItem.credentials_data,
          finalPricePaid: finalPrice,
          newBalance: updatedUser.balance,
          orderId: `ORD-${Date.now().toString().slice(-6)}`
        };
      } catch (err) {
        await connection.rollback();
        connection.release();
        logger.error('MySQL purchaseStockItem failed:', err.message);
        throw err;
      }
    }

    // --- JSON Fallback Execution ---
    const db = await jsonEngine.read();
    const stockIndex = db.stockItems.findIndex(s => Number(s.product_id) === Number(productId) && !s.is_sold);

    if (stockIndex === -1) return { error: 'OUT_OF_STOCK' };

    const userIndex = db.users.findIndex(u => Number(u.telegram_id) === Number(userId));
    if (userIndex === -1 || Number(db.users[ userIndex ].balance || 0) < Number(finalPrice)) {
      return { error: 'INSUFFICIENT_FUNDS' };
    }

    db.stockItems[ stockIndex ].is_sold = true;
    const credentials = db.stockItems[ stockIndex ].credentials_data;

    db.users[ userIndex ].balance = Number(db.users[ userIndex ].balance) - finalPrice;
    db.users[ userIndex ].total_spent = Number(db.users[ userIndex ].total_spent || 0) + finalPrice;

    // Process Referral Commission
    const referrerId = db.users[ userIndex ].referred_by;
    if (referrerId) {
      const refIndex = db.users.findIndex(u => Number(u.telegram_id) === Number(referrerId));
      if (refIndex !== -1) {
        db.users[ refIndex ].balance = Number(db.users[ refIndex ].balance || 0) + (finalPrice * 0.05);
      }
    }

    const orderId = `ORD-${Date.now().toString().slice(-6)}`;
    db.orders = db.orders || [];
    db.orders.push({
      order_id: orderId,
      user_id: Number(userId),
      product_id: Number(productId),
      credentials_delivered: credentials,
      price_paid: finalPrice,
      timestamp: new Date().toISOString()
    });

    await jsonEngine.write(db);

    return {
      success: true,
      credentials,
      finalPricePaid: finalPrice,
      newBalance: db.users[ userIndex ].balance,
      orderId
    };
  }

  // --- DEPOSITS ---
  async createDeposit(userId, amount, paystackReference = null) {
    if (this.isPrimaryConnected) {
      try {
        const [ result ] = await this.pool.execute(
          'INSERT INTO deposits (user_id, amount, status, paystack_reference) VALUES (?, ?, "pending_bank", ?)',
          [ userId, amount, paystackReference ]
        );
        return { id: result.insertId, user_id: userId, amount, status: 'pending_bank', paystack_reference: paystackReference };
      } catch (err) {
        logger.error('MySQL createDeposit failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.createDeposit({ user_id: userId, amount, status: 'pending_bank', paystack_reference: paystackReference });
  }

  async updateDepositReference(depositId, paystackReference) {
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute(
          'UPDATE deposits SET paystack_reference = ? WHERE id = ?',
          [ paystackReference, depositId ]
        );
        return true;
      } catch (err) {
        logger.error('MySQL updateDepositReference failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.updateDepositReference(depositId, paystackReference);
  }

  async getDepositById(depositId) {
    if (this.isPrimaryConnected) {
      try {
        const [ rows ] = await this.pool.execute('SELECT * FROM deposits WHERE id = ?', [ depositId ]);
        if (rows.length > 0) return rows[ 0 ];
      } catch (err) {
        logger.error('MySQL getDepositById failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.getDeposit(depositId);
  }

  async getPendingDeposits() {
    if (this.isPrimaryConnected) {
      try {
        const [ rows ] = await this.pool.execute(
          'SELECT * FROM deposits WHERE status IN ("pending_bank", "pending_verification") ORDER BY id DESC'
        );
        return rows;
      } catch (err) {
        logger.error('MySQL getPendingDeposits failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return (db.deposits || []).filter(d => [ 'pending_bank', 'pending_verification' ].includes(d.status));
  }

  async updateDepositBankDetails(depositId, bankDetails) {
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute(
          'UPDATE deposits SET bank_details = ?, status = "pending_verification" WHERE id = ?',
          [ bankDetails, depositId ]
        );
        const [ rows ] = await this.pool.execute('SELECT * FROM deposits WHERE id = ?', [ depositId ]);
        return rows[ 0 ];
      } catch (err) {
        logger.error('MySQL updateDepositBankDetails failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.updateDepositStatus(depositId, 'pending_verification', bankDetails);
  }

  async updateDepositStatus(depositId, status) {
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute('UPDATE deposits SET status = ? WHERE id = ?', [ status, depositId ]);
        const [ rows ] = await this.pool.execute('SELECT * FROM deposits WHERE id = ?', [ depositId ]);
        return rows[ 0 ];
      } catch (err) {
        logger.error('MySQL updateDepositStatus failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.updateDepositStatus(depositId, status);
  }

  // --- TICKETS ---
  async createTicket(ticketData) {
    const { user_id, category, message, status } = ticketData;
    if (this.isPrimaryConnected) {
      try {
        const [ res ] = await this.pool.execute(
          'INSERT INTO tickets (user_id, category, message, status) VALUES (?, ?, ?, ?)',
          [ user_id, category, message, status || 'open' ]
        );
        return { id: res.insertId, user_id, category, message, status: status || 'open' };
      } catch (err) {
        logger.error('MySQL createTicket failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    const newTicket = { id: db.tickets.length + 1, user_id, category, message, status: status || 'open', created_at: new Date().toISOString() };
    db.tickets.push(newTicket);
    await jsonEngine.write(db);
    return newTicket;
  }

  async updateTicketStatus(ticketId, status) {
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute('UPDATE tickets SET status = ? WHERE id = ?', [ status, ticketId ]);
        return true;
      } catch (err) {
        logger.error('MySQL updateTicketStatus failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    const ticket = db.tickets.find(t => Number(t.id) === Number(ticketId));
    if (ticket) {
      ticket.status = status;
      await jsonEngine.write(db);
    }
    return true;
  }

  async processRefund({ ticketId, userId, amount }) {
    const refundAmount = Number(amount);

    if (this.isPrimaryConnected) {
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();

        await connection.execute('UPDATE users SET balance = balance + ? WHERE telegram_id = ?', [ refundAmount, userId ]);

        if (ticketId) {
          await connection.execute('UPDATE tickets SET status = "closed" WHERE id = ?', [ ticketId ]);
        }

        await connection.commit();
        connection.release();

        const updatedUser = await this.getUser(userId);
        return { success: true, newBalance: updatedUser.balance };
      } catch (err) {
        await connection.rollback();
        connection.release();
        logger.error('MySQL processRefund failed:', err.message);
        throw err;
      }
    }

    const db = await jsonEngine.read();
    const userIndex = db.users.findIndex(u => Number(u.telegram_id) === Number(userId));

    if (userIndex !== -1) {
      db.users[ userIndex ].balance = Number(db.users[ userIndex ].balance || 0) + refundAmount;

      if (ticketId) {
        const ticket = db.tickets.find(t => Number(t.id) === Number(ticketId));
        if (ticket) ticket.status = 'closed';
      }

      await jsonEngine.write(db);
      return { success: true, newBalance: db.users[ userIndex ].balance };
    }

    return { error: 'USER_NOT_FOUND' };
  }

  // --- FAVORITES & LIKES ---
  async toggleUserFavorite(telegramId, productId) {
    const pId = Number(productId);
    const user = await this.getUser(telegramId);
    let favorites = user ? (user.favorites || []) : [];
    let isAdded = false;

    if (favorites.includes(pId)) {
      favorites = favorites.filter(id => id !== pId);
      isAdded = false;
    } else {
      favorites.push(pId);
      isAdded = true;
    }

    user.favorites = favorites;
    await this.saveUser(user);
    await this.adjustProductLikes(pId, isAdded ? 1 : -1);

    return { isAdded, favorites };
  }

  async adjustProductLikes(productId, delta) {
    const pId = Number(productId);
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute('UPDATE products SET likes_count = GREATEST(0, likes_count + ?) WHERE id = ?', [ delta, pId ]);
        return;
      } catch (err) {
        logger.error('MySQL adjustProductLikes failed:', err.message);
        throw err;
      }
    }

    const db = await jsonEngine.read();
    const product = (db.products || []).find(p => Number(p.id) === pId);
    if (product) {
      product.likes_count = Math.max(0, Number(product.likes_count || 0) + delta);
      await jsonEngine.write(db);
    }
  }

  async getFavoriteProducts(telegramId) {
    const user = await this.getUser(telegramId);
    const favIds = user ? (user.favorites || []) : [];
    if (favIds.length === 0) return [];

    const allProducts = await this.getAllProducts();
    return allProducts.filter(p => favIds.includes(Number(p.id)));
  }

  // --- BROADCAST TEMPLATES ---
  async getBroadcastTemplates() {
    if (this.isPrimaryConnected) {
      try {
        const [rows] = await this.pool.execute('SELECT * FROM broadcast_templates ORDER BY id DESC');
        return rows;
      } catch (err) {
        logger.error('MySQL getBroadcastTemplates failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.getBroadcastTemplates();
  }

  async createBroadcastTemplate(title, content) {
    if (this.isPrimaryConnected) {
      try {
        const [res] = await this.pool.execute('INSERT INTO broadcast_templates (title, content) VALUES (?, ?)', [title, content]);
        return { id: res.insertId, title, content };
      } catch (err) {
        logger.error('MySQL createBroadcastTemplate failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.saveBroadcastTemplate({ title, content });
  }

  async deleteBroadcastTemplate(templateId) {
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute('DELETE FROM broadcast_templates WHERE id = ?', [templateId]);
        return true;
      } catch (err) {
        logger.error('MySQL deleteBroadcastTemplate failed:', err.message);
        throw err;
      }
    }
    return await jsonEngine.deleteBroadcastTemplate(templateId);
  }

  // --- ANALYTICS ---
  async getSalesAnalytics() {
    if (this.isPrimaryConnected) {
      try {
        const [ userStats ] = await this.pool.execute('SELECT COUNT(*) AS total_users, SUM(balance) AS total_user_balance FROM users');
        const [ depositStats ] = await this.pool.execute('SELECT COUNT(*) AS approved_count, SUM(amount) AS total_deposited FROM deposits WHERE status = "approved"');
        const [ topLiked ] = await this.pool.execute('SELECT title, likes_count FROM products ORDER BY likes_count DESC LIMIT 3');
        const [ outOfStock ] = await this.pool.execute('SELECT COUNT(p.id) AS low_stock_count FROM products p LEFT JOIN stock_items s ON p.id = s.product_id AND s.is_sold = FALSE GROUP BY p.id HAVING COUNT(s.id) = 0');

        return {
          totalUsers: userStats[ 0 ].total_users || 0,
          totalUserBalance: userStats[ 0 ].total_user_balance || 0,
          approvedDepositsCount: depositStats[ 0 ].approved_count || 0,
          totalDeposited: depositStats[ 0 ].total_deposited || 0,
          topLikedProducts: topLiked || [],
          outOfStockCount: outOfStock.length || 0
        };
      } catch (err) {
        logger.error('MySQL getSalesAnalytics failed:', err.message);
        throw err;
      }
    }

    const db = await jsonEngine.read();
    const users = db.users || [];
    const deposits = db.deposits || [];
    const products = db.products || [];
    const stockItems = db.stockItems || [];
    const orders = db.orders || [];

    const totalUsers = users.length;
    const totalUserBalance = users.reduce((sum, u) => sum + Number(u.balance || 0), 0);
    const approvedDeposits = deposits.filter(d => d.status === 'approved');
    const totalDeposited = approvedDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const totalRevenueSpent = orders.reduce((sum, o) => sum + Number(o.price_paid || 0), 0);

    const topLikedProducts = [ ...products ]
      .sort((a, b) => Number(b.likes_count || 0) - Number(a.likes_count || 0))
      .slice(0, 3)
      .map(p => ({ title: p.title, likes_count: p.likes_count || 0 }));

    const outOfStockCount = products.filter(p => {
      const remaining = stockItems.filter(s => Number(s.product_id) === Number(p.id) && !s.is_sold).length;
      return remaining === 0;
    }).length;

    return {
      totalUsers,
      totalUserBalance,
      approvedDepositsCount: approvedDeposits.length,
      totalDeposited,
      totalOrders: orders.length,
      totalRevenueSpent,
      topLikedProducts,
      outOfStockCount
    };
  }

  async getAllAdmins() {
    if (this.isPrimaryConnected) {
      try {
        const [rows] = await this.pool.execute('SELECT telegram_id FROM users WHERE role = "admin"');
        return rows.map(r => r.telegram_id);
      } catch (err) {
        logger.error('MySQL getAllAdmins failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return (db.users || []).filter(u => u.role === 'admin').map(u => u.telegram_id);
  }

  async updateProduct(productId, updates) {
    const pId = Number(productId);
    const { title, price, description, low_stock_threshold } = updates;

    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute(
          'UPDATE products SET title = ?, price = ?, description = ?, low_stock_threshold = ? WHERE id = ?',
          [title, price, description, low_stock_threshold, pId]
        );
        return true;
      } catch (err) {
        logger.error('MySQL updateProduct failed:', err.message);
        throw err;
      }
    }

    const db = await jsonEngine.read();
    const product = (db.products || []).find(p => Number(p.id) === pId);
    if (product) {
      if (title) product.title = title;
      if (price) product.price = Number(price);
      if (description) product.description = description;
      if (low_stock_threshold !== undefined) product.low_stock_threshold = Number(low_stock_threshold);
      await jsonEngine.write(db);
      return true;
    }
    return false;
  }

  async exportDatabase(asSql = false) {
    let data;
    if (this.isPrimaryConnected) {
      try {
        const [users] = await this.pool.execute('SELECT * FROM users');
        const [categories] = await this.pool.execute('SELECT * FROM categories');
        const [products] = await this.pool.execute('SELECT * FROM products');
        const [stockItems] = await this.pool.execute('SELECT * FROM stock_items');
        const [deposits] = await this.pool.execute('SELECT * FROM deposits');
        const [tickets] = await this.pool.execute('SELECT * FROM tickets');
        const [restockSubscriptions] = await this.pool.execute('SELECT * FROM restock_subscriptions');
        const [systemSettings] = await this.pool.execute('SELECT * FROM system_settings');
        
        data = {
            users: users.map(u => ({...u, favorites: typeof u.favorites === 'string' ? JSON.parse(u.favorites || '[]') : (u.favorites || [])})),
            categories,
            products,
            stockItems,
            deposits,
            tickets,
            restock_subscriptions: restockSubscriptions,
            system_settings: systemSettings
        };
      } catch (err) {
        logger.error('MySQL exportDatabase failed:', err.message);
        throw err;
      }
    } else {
        data = await jsonEngine.read();
    }

    if (asSql) {
        return generateSqlDump(data);
    }
    return data;
  }

  async updateSetting(key, value) {
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute(
          'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
          [key, value, value]
        );
        return true;
      } catch (err) {
        logger.error('MySQL updateSetting failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    db.system_settings = db.system_settings || {};
    db.system_settings[key] = value;
    await jsonEngine.write(db);
    return true;
  }

  async getSetting(key) {
    if (this.isPrimaryConnected) {
      try {
        const [rows] = await this.pool.execute('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key]);
        return rows.length > 0 ? rows[0].setting_value : null;
      } catch (err) {
        logger.error('MySQL getSetting failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return db.system_settings ? db.system_settings[key] || null : null;
  }

  async getAndLockUnsold(productId) {
    if (this.isPrimaryConnected) {
      try {
        const [rows] = await this.pool.execute(
          'SELECT * FROM stock_items WHERE product_id = ? AND is_sold = FALSE LIMIT 1',
          [productId]
        );
        if (rows.length > 0) {
          const item = rows[0];
          await this.pool.execute('UPDATE stock_items SET is_sold = TRUE WHERE id = ?', [item.id]);
          return item;
        }
      } catch (err) {
        logger.error('MySQL getAndLockUnsold failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    const item = (db.stockItems || []).find(s => Number(s.product_id) === Number(productId) && !s.is_sold);
    if (item) {
      item.is_sold = true;
      await jsonEngine.write(db);
      return item;
    }
    return null;
  }
  async deleteCategory(categoryId) {
    const cId = Number(categoryId);
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute('DELETE FROM categories WHERE id = ?', [ cId ]);
        return true;
      } catch (err) {
        logger.error('MySQL deleteCategory failed:', err.message);
        throw err;
      }
    }

    const db = await jsonEngine.read();
    const productIdsToDelete = (db.products || []).filter(p => Number(p.category_id) === cId).map(p => Number(p.id));

    db.categories = (db.categories || []).filter(c => Number(c.id) !== cId);
    db.products = (db.products || []).filter(p => Number(p.category_id) !== cId);
    db.stockItems = (db.stockItems || []).filter(s => !productIdsToDelete.includes(Number(s.product_id)));

    await jsonEngine.write(db);
    return true;
  }

  async getAllUsers() {
    if (this.isPrimaryConnected) {
      try {
        const [rows] = await this.pool.execute('SELECT telegram_id, username, balance, total_spent, favorites, is_frozen FROM users');
        return rows.map(u => ({
          ...u,
          is_frozen: !!u.is_frozen,
          favorites: typeof u.favorites === 'string' ? JSON.parse(u.favorites || '[]') : (u.favorites || [])
        }));
      } catch (err) {
        logger.error('MySQL getAllUsers failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return (db.users || []).map(u => ({ 
      telegram_id: u.telegram_id, 
      username: u.username,
      balance: u.balance,
      total_spent: u.total_spent,
      favorites: u.favorites || [],
      is_frozen: !!u.is_frozen
    }));
  }

  async getTopBuyers() {
    if (this.isPrimaryConnected) {
      try {
        const [rows] = await this.pool.execute('SELECT telegram_id, username, total_spent FROM users ORDER BY total_spent DESC LIMIT 20');
        return rows;
      } catch (err) {
        logger.error('MySQL getTopBuyers failed:', err.message);
        throw err;
      }
    }
    const db = await jsonEngine.read();
    return (db.users || [])
      .map(u => ({ telegram_id: u.telegram_id, username: u.username, total_spent: Number(u.total_spent || 0) }))
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 20);
  }

  async deleteProduct(productId) {
    const pId = Number(productId);
    if (this.isPrimaryConnected) {
      try {
        await this.pool.execute('DELETE FROM products WHERE id = ?', [ pId ]);
        return true;
      } catch (err) {
        logger.error('MySQL deleteProduct failed:', err.message);
        throw err;
      }
    }

    const db = await jsonEngine.read();
    db.products = (db.products || []).filter(p => Number(p.id) !== pId);
    db.stockItems = (db.stockItems || []).filter(s => Number(s.product_id) !== pId);

    await jsonEngine.write(db);
    return true;
  }
}

module.exports = new DatabaseService();