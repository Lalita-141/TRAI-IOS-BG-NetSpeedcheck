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
 * Initializes MySQL database and table schema automatically on boot,
 * including auto-migration for newly added columns.
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

    // 2. Ensure base table schema exists
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS samples (
        id VARCHAR(64) PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        ts DOUBLE NOT NULL,
        test_type VARCHAR(32) DEFAULT 'speed',
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
        video_delay_ms INT NULL,
        web_delay_ms INT NULL,
        page_load_sec DOUBLE NULL,
        ttfb_ms INT NULL,
        streaming_quality VARCHAR(32) NULL,
        buffering_rate VARCHAR(32) NULL,
        signal_dbm DOUBLE NULL,
        signal_quality VARCHAR(32) NULL,
        cell_tower VARCHAR(64) NULL,
        frequency_band VARCHAR(32) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_samples_ts (ts),
        INDEX idx_samples_device_id (device_id),
        INDEX idx_samples_carrier (carrier),
        INDEX idx_samples_radio (radio)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await pool.query(createTableSql);

    // 2b. Ensure feedback table exists
    const createFeedbackTableSql = `
      CREATE TABLE IF NOT EXISTS feedback (
        id VARCHAR(64) PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        carrier VARCHAR(64) NULL,
        rating INT NOT NULL,
        category VARCHAR(64) NULL,
        comment TEXT NULL,
        lat DOUBLE NULL,
        lng DOUBLE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_feedback_device (device_id),
        INDEX idx_feedback_carrier (carrier)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await pool.query(createFeedbackTableSql);

    // 3. Schema Auto-Migration: add any columns if migrating an existing table
    const columnsToAdd = [
      { name: 'test_type', type: "VARCHAR(32) DEFAULT 'speed'" },
      { name: 'video_delay_ms', type: 'INT NULL' },
      { name: 'web_delay_ms', type: 'INT NULL' },
      { name: 'page_load_sec', type: 'DOUBLE NULL' },
      { name: 'ttfb_ms', type: 'INT NULL' },
      { name: 'streaming_quality', type: 'VARCHAR(32) NULL' },
      { name: 'buffering_rate', type: 'VARCHAR(32) NULL' },
      { name: 'signal_dbm', type: 'DOUBLE NULL' },
      { name: 'signal_quality', type: 'VARCHAR(32) NULL' },
      { name: 'cell_tower', type: 'VARCHAR(64) NULL' },
      { name: 'frequency_band', type: 'VARCHAR(32) NULL' },
    ];

    const [existingCols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'samples'`,
      [dbConfig.database]
    );
    const existingColSet = new Set(existingCols.map(c => c.COLUMN_NAME.toLowerCase()));

    for (const col of columnsToAdd) {
      if (!existingColSet.has(col.name.toLowerCase())) {
        try {
          await pool.query(`ALTER TABLE samples ADD COLUMN ${col.name} ${col.type}`);
          console.log(`[Schema Migration] Added column "${col.name}" to samples table.`);
        } catch (e) {
          // Non-fatal if column already exists
        }
      }
    }

    console.log(`[MySQL] Database "${dbConfig.database}" and table "samples" verified with TRAI schema.`);
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
