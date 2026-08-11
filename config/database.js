const mysql = require('mysql2/promise');
const config = require('./index');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: config.mysql.host,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  port: config.mysql.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: config.mysql.connectTimeout
});

module.exports = pool;
