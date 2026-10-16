const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'netspeed_db',
  waitForConnections: true,
  connectionLimit: 25,
  queueLimit: 0,
};

// Create main connection pool
const pool = mysql.createPool(dbConfig);

/**
 * Initializes MySQL database and table schema automatically on boot.
 */
async function initDatabase() {
  try {
    // 1. Connect without DB selected to ensure the database exists
    const tempConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    await tempConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await tempConnection.end();

    // 2. Ensure table schema and indexes exist
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS samples (
        id VARCHAR(64) PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        ts DOUBLE NOT NULL,
        down_mbps DOUBLE NULL,
        up_mbps DOUBLE NULL,
        latency_ms DOUBLE NULL,
        jitter_ms DOUBLE NULL,
        packet_loss_pct DOUBLE NULL,
        network VARCHAR(32) NULL,
        radio VARCHAR(32) NULL,
        carrier VARCHAR(64) NULL,
        device_model VARCHAR(64) NULL,
        os_platform VARCHAR(32) NULL,
        location_type VARCHAR(32) NULL,
        lat DOUBLE NULL,
        lng DOUBLE NULL,
        accuracy DOUBLE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_samples_ts (ts),
        INDEX idx_samples_device_id (device_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    await pool.query(createTableSql);
    console.log(`[MySQL] Database "${dbConfig.database}" and table "samples" verified.`);
    return true;
  } catch (err) {
    console.error(`[MySQL Connection Error] Unable to connect to MySQL at ${dbConfig.host}:${dbConfig.port}:`, err.message);
    console.error(`Please verify MySQL is running and credentials in .env are correct.`);
    return false;
  }
}

module.exports = {
  pool,
  initDatabase,
};
