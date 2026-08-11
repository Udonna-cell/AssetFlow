const dbService = require('../database/dbService');

class UserModel {
  static async findById(telegramId) {
    try {
      return await dbService.getUser(telegramId);
    } catch (err) {
      // dbService already handles fallback, but re-throw if needed or log
      return null;
    }
  }

  static async getAll() {
    return await dbService.getAllUsers();
  }

  static async updateBalance(telegramId, newBalance) {
    await dbService.execute('UPDATE users SET balance = ? WHERE telegram_id = ?', [newBalance, telegramId]);
  }
}

module.exports = UserModel;
