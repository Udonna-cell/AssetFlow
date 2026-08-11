require('dotenv').config();

const config = {
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
    connectTimeout: 5000
  }
};

module.exports = {
  ...config,
  refresh: async (dbService) => {
    const adminIdsStr = await dbService.getSetting('admin_ids');
    if (adminIdsStr) {
      config.adminIds = adminIdsStr.split(',').map(id => Number(id.trim())).filter(Boolean);
    }
  }
};
