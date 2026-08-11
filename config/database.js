const mysql = require('mysql2/promise');

module.exports = {
  createPool: (dbConfig) => {
    return mysql.createPool({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      port: dbConfig.port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: dbConfig.connectTimeout
    });
  }
};
