const pool = require('../config/database');
const jsonEngine = require('../database/jsonEngine');
const logger = require('../utils/logger');

class ProductModel {
  static async getAllCategories() {
    try {
      const [rows] = await pool.execute('SELECT * FROM categories ORDER BY id DESC');
      return rows;
    } catch (err) {
      logger.error('ProductModel.getAllCategories failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      return db.categories || [];
    }
  }

  static async getProductsByCategory(categoryId) {
    try {
      const query = `
        SELECT p.*, COUNT(s.id) AS stock_count
        FROM products p
        LEFT JOIN stock_items s ON p.id = s.product_id AND s.is_sold = FALSE
        WHERE p.category_id = ?
        GROUP BY p.id
      `;
      const [rows] = await pool.execute(query, [categoryId]);
      return rows;
    } catch (err) {
      logger.error('ProductModel.getProductsByCategory failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      return (db.products || []).filter(p => Number(p.category_id) === Number(categoryId));
    }
  }

  static async findById(productId) {
    try {
      const query = `
        SELECT p.*, COUNT(s.id) AS stock_count
        FROM products p
        LEFT JOIN stock_items s ON p.id = s.product_id AND s.is_sold = FALSE
        WHERE p.id = ?
        GROUP BY p.id
      `;
      const [rows] = await pool.execute(query, [productId]);
      return rows[0] || null;
    } catch (err) {
      logger.error('ProductModel.findById failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      return (db.products || []).find(p => Number(p.id) === Number(productId)) || null;
    }
  }

  static async createCategory(name, description = '') {
    try {
      const [result] = await pool.execute('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description]);
      return result.insertId;
    } catch (err) {
      logger.error('ProductModel.createCategory failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      const newCat = { id: db.categories.length + 1, name, description };
      db.categories.push(newCat);
      jsonEngine.write(db);
      return newCat.id;
    }
  }
}

module.ProductModel = ProductModel;
