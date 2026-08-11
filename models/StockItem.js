const pool = require('../config/database');
const jsonEngine = require('../database/jsonEngine');
const logger = require('../utils/logger');

class StockItemModel {
  static async addItems(productId, itemsArray) {
    try {
      const values = itemsArray.map(item => [productId, item, false]);
      await pool.query('INSERT INTO stock_items (product_id, credentials_data, is_sold) VALUES ?', [values]);
      return true;
    } catch (err) {
      logger.error('StockItemModel.addItems failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      itemsArray.forEach(data => {
        db.stockItems.push({
          id: db.stockItems.length + 1,
          product_id: Number(productId),
          credentials_data: data,
          is_sold: false
        });
      });
      jsonEngine.write(db);
      return true;
    }
  }

  static async getAndLockUnsold(productId) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM stock_items WHERE product_id = ? AND is_sold = FALSE LIMIT 1',
        [productId]
      );
      if (rows.length > 0) {
        const item = rows[0];
        await pool.execute('UPDATE stock_items SET is_sold = TRUE WHERE id = ?', [item.id]);
        return item;
      }
    } catch (err) {
      logger.error('StockItemModel.getAndLockUnsold failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      const item = db.stockItems.find(s => Number(s.product_id) === Number(productId) && !s.is_sold);
      if (item) {
        item.is_sold = true;
        jsonEngine.write(db);
        return item;
      }
    }
    return null;
  }
}

module.exports = StockItemModel;
