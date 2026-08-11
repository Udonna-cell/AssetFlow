const pool = require('../config/database');
const jsonEngine = require('../database/jsonEngine');
const logger = require('../utils/logger');

class TicketModel {
  static async create({ user_id, category, message, status = 'open' }) {
    try {
      const [res] = await pool.execute(
        'INSERT INTO tickets (user_id, category, message, status) VALUES (?, ?, ?, ?)',
        [user_id, category, message, status]
      );
      return { id: res.insertId, user_id, category, message, status };
    } catch (err) {
      logger.error('TicketModel.create failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      const newTicket = { id: db.tickets.length + 1, user_id, category, message, status, created_at: new Date().toISOString() };
      db.tickets.push(newTicket);
      jsonEngine.write(db);
      return newTicket;
    }
  }

  static async updateStatus(ticketId, status) {
    try {
      await pool.execute('UPDATE tickets SET status = ? WHERE id = ?', [status, ticketId]);
    } catch (err) {
      logger.error('TicketModel.updateStatus failed, using JSON fallback:', err.message);
      const db = jsonEngine.read();
      const ticket = db.tickets.find(t => Number(t.id) === Number(ticketId));
      if (ticket) {
        ticket.status = status;
        jsonEngine.write(db);
      }
    }
  }
}

module.exports = TicketModel;
