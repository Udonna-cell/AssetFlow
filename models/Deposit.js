const pool = require('../config/database');
const jsonEngine = require('../database/jsonEngine');
const logger = require('../utils/logger');

class DepositModel {
  static async create(userId, amount) {
    try {
      const [res] = await pool.execute(
        'INSERT INTO deposits (user_id, amount, status) VALUES (?, ?, "pending_bank")',
        [userId, amount]
      );
      return { id: res.insertId, user_id: userId, amount, status: 'pending_bank' };
    } catch (err) {
      logger.error('DepositModel.create failed, using JSON fallback:', err.message);
      return jsonEngine.createDeposit({ user_id: userId, amount, status: 'pending_bank' });
    }
  }

  static async findById(id) {
    try {
      const [rows] = await pool.execute('SELECT * FROM deposits WHERE id = ?', [id]);
      return rows[0] || null;
    } catch (err) {
      logger.error('DepositModel.findById failed, using JSON fallback:', err.message);
      return jsonEngine.getDeposit(id);
    }
  }
}

module.exports = DepositModel;
