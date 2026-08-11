require('dotenv').config();

module.exports = {
  botToken: process.env.BOT_TOKEN || '',
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(Boolean),
  usdToNgnRate: Number(process.env.USD_TO_NGN_RATE) || 1500,
  mysql: {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'assetflow',
    port: Number(process.env.DB_PORT) || 3306,
    connectTimeout: 5000 // Fast timeout to trigger JSON fallback if offline
  }
};
