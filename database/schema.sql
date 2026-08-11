CREATE DATABASE IF NOT EXISTS assetflow;
USE assetflow;

CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username VARCHAR(255) DEFAULT '',
  role ENUM('buyer', 'admin') DEFAULT 'buyer',
  balance DECIMAL(12, 2) DEFAULT 0.00,
  total_spent DECIMAL(12, 2) DEFAULT 0.00,
  referred_by BIGINT NULL,
  is_frozen BOOLEAN DEFAULT FALSE,
  favorites JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT,
  title VARCHAR(255) NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  description TEXT,
  warranty_hours INT DEFAULT 24,
  likes_count INT DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT,
  credentials_data TEXT NOT NULL,
  is_sold BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS restock_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT,
  user_id BIGINT,
  UNIQUE(product_id, user_id)
);

CREATE TABLE IF NOT EXISTS deposits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT,
  amount DECIMAL(12, 2) NOT NULL,
  status ENUM('pending_bank', 'pending_verification', 'approved', 'rejected') DEFAULT 'pending_bank',
  bank_details TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT,
  order_id INT NULL,
  category VARCHAR(50),
  message TEXT NOT NULL,
  status ENUM('open', 'replied', 'closed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value TEXT NOT NULL
);
