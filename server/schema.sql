-- NetSpeed QoS Monitor Database Schema for MySQL
CREATE DATABASE IF NOT EXISTS netspeed_db;
USE netspeed_db;

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
