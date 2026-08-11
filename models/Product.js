const dbService = require('../database/dbService');

class ProductModel {
  static async getAllCategories() {
    return await dbService.getCategories();
  }

  static async getProductsByCategory(categoryId) {
    return await dbService.getProductsByCategory(categoryId);
  }

  static async findById(productId) {
    return await dbService.getProductById(productId);
  }

  static async createCategory(name, description = '') {
    return await dbService.createCategory(name, description);
  }
}

module.exports = ProductModel;
