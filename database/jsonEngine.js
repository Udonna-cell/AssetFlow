const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = path.join(__dirname, 'fallback_db.json');

class JsonEngine {
  constructor() {
    this.ensureFileExists();
  }

  ensureFileExists() {
    if (!fsSync.existsSync(DB_PATH)) {
      const initialData = {
        users: [],
        categories: [],
        products: [],
        stockItems: [],
        deposits: [],
        orders: [],
        tickets: [],
        broadcast_templates: []
      };
      fsSync.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    }
  }

  async read() {
    try {
      const data = await fs.readFile(DB_PATH, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      logger.error('Reading JSON fallback file failed:', err.message);
      return { users: [], categories: [], products: [], stockItems: [], deposits: [], orders: [], tickets: [] };
    }
  }

  async write(data) {
    const tempPath = `${DB_PATH}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.rename(tempPath, DB_PATH);
      return true;
    } catch (err) {
      logger.error('Writing to JSON fallback file failed:', err.message);
      return false;
    }
  }

  // --- Broadcast Templates Helper Methods ---
  async getBroadcastTemplates() {
    const db = await this.read();
    return db.broadcast_templates || [];
  }

  async saveBroadcastTemplate(templateData) {
    const db = await this.read();
    db.broadcast_templates = db.broadcast_templates || [];
    const id = templateData.id || (Math.max(...db.broadcast_templates.map(t => Number(t.id)), 0) + 1);
    
    const index = db.broadcast_templates.findIndex(t => Number(t.id) === Number(id));
    if (index > -1) {
      db.broadcast_templates[index] = { ...db.broadcast_templates[index], ...templateData, id };
    } else {
      db.broadcast_templates.push({ ...templateData, id });
    }
    await this.write(db);
    return { ...templateData, id };
  }

  async deleteBroadcastTemplate(templateId) {
    const db = await this.read();
    db.broadcast_templates = (db.broadcast_templates || []).filter(t => Number(t.id) !== Number(templateId));
    await this.write(db);
    return true;
  }

  // --- User Helper Methods ---
  async findUser(telegramId) {
    const db = await this.read();
    return db.users.find(u => Number(u.telegram_id) === Number(telegramId)) || null;
  }

  async saveUser(userData) {
    const db = await this.read();
    const index = db.users.findIndex(u => Number(u.telegram_id) === Number(userData.telegram_id));
    
    if (index > -1) {
      db.users[index] = { ...db.users[index], ...userData };
    } else {
      db.users.push(userData);
    }

    await this.write(db);
    return userData;
  }

  // --- Deposit Helper Methods ---
  async createDeposit(depositData) {
    const db = await this.read();
    const id = db.deposits.length + 1;
    const newDeposit = { id, ...depositData, created_at: new Date().toISOString() };
    db.deposits.push(newDeposit);
    await this.write(db);
    return newDeposit;
  }

  async getDeposit(depositId) {
    const db = await this.read();
    return db.deposits.find(d => Number(d.id) === Number(depositId)) || null;
  }

  async updateDepositStatus(depositId, status, bankDetails = null) {
    const db = await this.read();
    const deposit = db.deposits.find(d => Number(d.id) === Number(depositId));
    if (deposit) {
      deposit.status = status;
      if (bankDetails) deposit.bank_details = bankDetails;
      await this.write(db);
    }
    return deposit;
  }

  async updateUserBalance(telegramId, amount) {
    const db = await this.read();
    const user = db.users.find(u => Number(u.telegram_id) === Number(telegramId));
    if (user) {
      user.balance = Number(user.balance || 0) + Number(amount);
      await this.write(db);
    }
    return user;
  }
}

module.exports = new JsonEngine();
