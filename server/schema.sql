-- NetSpeed QoS & TRAI Coverage Monitor Database Schema for MySQL
CREATE DATABASE IF NOT EXISTS netspeed_db;
USE netspeed_db;

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
    -- Video & Web Browsing QoS
    video_delay_ms INT NULL,
    web_delay_ms INT NULL,
    page_load_sec DOUBLE NULL,
    ttfb_ms INT NULL,
    streaming_quality VARCHAR(32) NULL,
    buffering_rate VARCHAR(32) NULL,
    -- Cellular Coverage & Signal Parameters
    signal_dbm DOUBLE NULL,
    signal_quality VARCHAR(32) NULL,
    cell_tower VARCHAR(64) NULL,
    frequency_band VARCHAR(32) NULL,
    -- Network Experience Coverage metadata (RF columns above stay NULL unless genuinely measured)
    measurement_source VARCHAR(40) NULL,
    quality_category VARCHAR(16) NULL,
    failure_reason VARCHAR(32) NULL,
    link_quality VARCHAR(16) NULL,
    location_ts DOUBLE NULL,
    speed_mps DOUBLE NULL,
    session_id VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_samples_ts (ts),
    INDEX idx_samples_device_id (device_id),
    INDEX idx_samples_carrier (carrier),
    INDEX idx_samples_radio (radio),
    INDEX idx_samples_coords (lat, lng)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
