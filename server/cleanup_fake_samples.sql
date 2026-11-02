-- Removes rows written by old app versions that contain invented values.
-- NOT run automatically. Back up the database first: deleting cannot be undone.
-- Run the SELECT first and check the counts before running the DELETEs.

USE netspeed_db;

SELECT 'coverage: invented speed' AS reason, COUNT(*) AS row_count
  FROM samples WHERE test_type = 'coverage' AND down_mbps IS NOT NULL
UNION ALL
SELECT 'video: invented jitter and speed', COUNT(*)
  FROM samples WHERE test_type = 'video' AND jitter_ms = 10.5
UNION ALL
SELECT 'ios background: invented Pune location', COUNT(*)
  FROM samples WHERE lat = 18.5501 AND lng = 73.941
UNION ALL
SELECT 'ios background: network always "cellular", all old rows', COUNT(*)
  FROM samples WHERE device_model = 'Apple iPhone (Native iOS Background)' AND created_at < '2026-11-03';

-- Rows that are certainly invented:
-- DELETE FROM samples WHERE test_type = 'coverage' AND down_mbps IS NOT NULL;
-- DELETE FROM samples WHERE test_type = 'video' AND jitter_ms = 10.5;
-- DELETE FROM samples WHERE lat = 18.5501 AND lng = 73.941;

-- Old iOS background rows have real speeds, but their network type and possibly
-- operator and latency are unreliable. Change the date to your release date of this fix:
-- DELETE FROM samples WHERE device_model = 'Apple iPhone (Native iOS Background)' AND created_at < '2026-11-03';
