const pool = require('../config/database');
const jsonEngine = require('../database/jsonEngine');
const logger = require('../utils/logger');

class UserModel {
  static async findById(telegramId) {
    try {
      const [rows] = await pool.execute('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
      if (rows.length > 0) {
        const user = rows[0];
        if (typeof user.favorites === 'string') {
          user.favorites = JSON.parse(user.favorites || '[]');
        }
        return user;
      }
    } catch (err) {
      logger.error('UserModel.findById failed, using JSON fallback:', err.message);
    }
    return jsonEngine.findUser(telegramId);
  }

  static async getAll() {
    try {
      const [rows] = await pool.execute('SELECT * FROM users');
      return rows;
    } catch (err) {
      logger.error('UserModel.getAll failed, using JSON fallback:', err.message);
      const db = await jsonEngine.read();
      return db.users || [];
    }
  }

  static async updateBalance(telegramId, newBalance) {
    try {
      await pool.execute('UPDATE users SET balance = ? WHERE telegram_id = ?', [newBalance, telegramId]);
    } catch (err) {
      logger.error('UserModel.updateBalance failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      const user = db.users.find(u => Number(u.telegram_id) === Number(telegramId));
      if (user) {
        user.balance = newBalance;
        jsonEngine.write(db);
      }
    }
  }
}

module.exports = UserModel;
