const dbService = require('../database/dbService');

class DepositModel {
  static async create(userId, amount) {
    return await dbService.createDeposit(userId, amount);
  }

  static async findById(id) {
    return await dbService.getDepositById(id);
  }
}

module.exports = DepositModel;
