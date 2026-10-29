-- One-off cleanup: remove fabricated RF values written by app builds before 2026-10-29.
--
-- Before this change, no app build measured RF signal on any platform. The
-- "Coverage Test" screen wrote hardcoded/estimated values (-58/-86/-96 dBm,
-- "Band 40 (2300 MHz)", "<CARRIER> - Sector 04") and a download speed derived
-- from that fake dBm. Any non-null signal_dbm / signal_quality / cell_tower /
-- frequency_band in rows created before this change is therefore not a real
-- measurement.
--
-- NOT run automatically. Review, back up the samples table, then run manually
-- against the MySQL database used by server.js:
--   mysql -u <user> -p netspeed_db < 2026-10-29-null-fabricated-signal.sql
--
-- Coverage rows also carried a fabricated down_mbps (120 + dBm) and fixed
-- up/latency/jitter/loss values; those cannot be told apart from real values
-- per row, so the coverage rows created before the cutoff are flagged instead.

START TRANSACTION;

-- 1. RF columns: never genuinely measured before this change.
UPDATE samples
SET signal_dbm = NULL,
    signal_quality = NULL,
    cell_tower = NULL,
    frequency_band = NULL
WHERE created_at < '2026-10-30 00:00:00'
  AND (signal_dbm IS NOT NULL
       OR signal_quality IS NOT NULL
       OR cell_tower IS NOT NULL
       OR frequency_band IS NOT NULL);

-- 2. Legacy coverage-test rows: performance fields were synthetic.
UPDATE samples
SET down_mbps = NULL,
    up_mbps = NULL,
    latency_ms = NULL,
    jitter_ms = NULL,
    packet_loss_pct = NULL
WHERE created_at < '2026-10-30 00:00:00'
  AND test_type = 'coverage';

COMMIT;
