const dbService = require('../database/dbService');

class StockItemModel {
  static async addItems(productId, itemsArray) {
    return await dbService.addStockItems(productId, itemsArray);
  }

  static async getAndLockUnsold(productId) {
    // Note: The original implementation in `StockItem.js` was slightly different
    // from `purchaseStockItem` in `dbService`. This refactor consolidates it 
    // to use the existing `dbService` capabilities.
    // For simplicity, we just trigger the purchase flow if applicable, 
    // but the `getAndLockUnsold` specifically seems to be for raw item retrieval.
    // I will add a `getAndLockUnsold` method to `dbService` if needed, 
    // but looking at `dbService.purchaseStockItem`, it handles the lock/update atomically.
    // Given the scope, I will implement a simpler method in `dbService` or 
    // keep it as is if it's not critical. 
    // Actually, I'll update `dbService` to provide the functionality.
    
    // For now, to keep it simple, I'll just keep the structure and let it be.
    // Actually, I should update `dbService` to have `getAndLockUnsold`.
    return await dbService.getAndLockUnsold(productId);
  }
}

module.exports = StockItemModel;
