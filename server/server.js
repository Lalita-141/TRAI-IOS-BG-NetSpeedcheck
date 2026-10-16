const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool, initDatabase } = require('./db');

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'netspeed-admin-2026';
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '90', 10);
const RETENTION_SECONDS = RETENTION_DAYS * 86400;

// Enable CORS for all origins
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);

// --- 1. Real-Time Network Speed Test Endpoints ---

// Latency & Jitter Probe (iOS mobile client calls this 5 times per test cycle)
app.get('/ping', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end('ok');
});

// Download Speed Test Probe (Streams requested megabytes of zero bytes)
const CHUNK_SIZE = 1024 * 1024; // 1 MB reused buffer
const ZERO_CHUNK = Buffer.alloc(CHUNK_SIZE);

app.get('/download', (req, res) => {
  const mbParam = parseInt(req.query.mb, 10);
  const mb = Math.min(Math.max(isNaN(mbParam) ? 2 : mbParam, 1), 20); // between 1MB and 20MB
  const totalBytes = mb * CHUNK_SIZE;

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': totalBytes,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });

  for (let i = 0; i < mb; i++) {
    res.write(ZERO_CHUNK);
  }
  res.end();
});

// Upload Speed Test Probe (Consumes raw binary stream sent by mobile client)
app.post(
  '/upload',
  express.raw({ type: '*/*', limit: '100mb' }),
  (req, res) => {
    const byteCount = req.body && Buffer.isBuffer(req.body) ? req.body.length : 0;
    res.json({ received: byteCount });
  }
);

// --- 2. Middleware for Telemetry APIs ---
app.use(express.json({ limit: '10mb' }));

// Health Check & Service Info
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Network Speed Monitor Server (Node.js & MySQL)',
    retention_period_days: RETENTION_DAYS,
    endpoints: {
      ping: '/ping',
      download: '/download?mb=2',
      upload: '/upload',
      samples: '/v1/speed-samples',
      data_retention: '/v1/privacy/data-retention',
    },
  });
});

/**
 * Data Retention Helper: Deletes samples older than specified days
 */
async function purgeExpiredSamples(days = RETENTION_DAYS) {
  try {
    const cutoffTs = Date.now() / 1000 - days * 86400;
    const [result] = await pool.query('DELETE FROM samples WHERE ts < ?', [cutoffTs]);
    return result.affectedRows || 0;
  } catch (err) {
    console.error('[Data Retention] Purge query failed:', err.message);
    return 0;
  }
}

// Ingest Batch of Speed Samples (Idempotent via INSERT IGNORE)
app.post('/v1/speed-samples', async (req, res) => {
  const batch = req.body;
  const samples = batch?.samples;

  if (!Array.isArray(samples) || samples.length === 0) {
    return res.status(400).json({ error: 'Invalid payload: samples array is required.' });
  }

  const rows = samples.map(s => [
    s.id,
    s.device_id,
    s.ts,
    s.down_mbps ?? null,
    s.up_mbps ?? null,
    s.latency_ms ?? null,
    s.jitter_ms ?? null,
    s.packet_loss_pct ?? null,
    s.network ?? null,
    s.radio ?? null,
    s.carrier ?? null,
    s.device_model ?? null,
    s.os_platform ?? null,
    s.location_type ?? null,
    s.lat ?? null,
    s.lng ?? null,
    s.accuracy ?? null,
  ]);

  try {
    // 1. Idempotent bulk insertion
    const insertSql = `
      INSERT IGNORE INTO samples (
        id, device_id, ts, down_mbps, up_mbps, latency_ms,
        jitter_ms, packet_loss_pct, network, radio, carrier,
        device_model, os_platform, location_type, lat, lng, accuracy
      ) VALUES ?
    `;
    await pool.query(insertSql, [rows]);

    // 2. Opportunistic cleanup of expired records
    const prunedCount = await purgeExpiredSamples(RETENTION_DAYS);

    return res.json({
      accepted: samples.length,
      pruned_expired: prunedCount,
    });
  } catch (err) {
    console.error('[Ingest Error]:', err.message);
    return res.status(500).json({ error: 'Database ingestion failed.' });
  }
});

// Admin Query Endpoint for Telemetry Samples
app.get('/v1/speed-samples', async (req, res) => {
  const apiKey = req.headers['x-admin-key'] || req.query.api_key;
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({
      detail: 'Access restricted: Unauthorized to access raw telemetry and location records.',
    });
  }

  const limitParam = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(isNaN(limitParam) ? 200 : limitParam, 1), 1000);

  try {
    const [rows] = await pool.query('SELECT * FROM samples ORDER BY ts DESC LIMIT ?', [limit]);
    return res.json(rows);
  } catch (err) {
    console.error('[List Samples Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve telemetry records.' });
  }
});

// Public Data Retention Policy Disclosure (Required for Apple App Store compliance)
app.get('/v1/privacy/data-retention', (req, res) => {
  res.json({
    policy_title: 'Data Retention and Deletion',
    retention_period_days: RETENTION_DAYS,
    retention_period_seconds: RETENTION_SECONDS,
    retention_statement:
      `NetSpeed QoS Monitor retains network measurement records on its backend for up to ` +
      `${RETENTION_DAYS} days from the date they are recorded. Records older than this period ` +
      `are automatically deleted through our data-retention process.`,
    deletion_request_statement:
      'Users may request deletion of their measurement records by contacting ' +
      'privacy@hareandturtle.ai. We will process verified requests in accordance with applicable law.',
    app_deletion_statement:
      'Deleting the App does not automatically delete records already transmitted to our backend. ' +
      'Users may contact us to request deletion of server-side records. Backup copies, where applicable, ' +
      'are managed according to our backup-retention procedures and applicable legal requirements.',
    contact_email: 'privacy@hareandturtle.ai',
    mail_to_request: 'mailto:privacy@hareandturtle.ai?subject=Data%20Deletion%20Request',
    automated_cleanup_enabled: true,
  });
});

// User Device Deletion (Immediate Right-to-be-Forgotten Request)
app.delete('/v1/speed-samples/device/:device_id', async (req, res) => {
  const cleanId = (req.params.device_id || '').trim();
  if (!cleanId || cleanId.length < 3) {
    return res.status(400).json({ detail: 'Invalid device_id provided.' });
  }

  try {
    const [result] = await pool.query('DELETE FROM samples WHERE device_id = ?', [cleanId]);
    const deletedCount = result.affectedRows || 0;

    return res.json({
      status: 'success',
      device_id: cleanId,
      deleted_count: deletedCount,
      message: `Successfully deleted ${deletedCount} measurement record(s) for device ${cleanId}.`,
    });
  } catch (err) {
    console.error('[Device Delete Error]:', err.message);
    return res.status(500).json({ error: 'Failed to delete device records.' });
  }
});

// Admin Manual Retention Purge
app.post('/v1/admin/retention-purge', async (req, res) => {
  const apiKey = req.headers['x-admin-key'] || req.query.api_key;
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({
      detail: 'Unauthorized: Admin API key required.',
    });
  }

  const daysParam = parseInt(req.query.days, 10);
  const days = Math.min(Math.max(isNaN(daysParam) ? RETENTION_DAYS : daysParam, 1), 365);

  try {
    const deleted = await purgeExpiredSamples(days);
    return res.json({
      status: 'success',
      retention_days: days,
      deleted_records: deleted,
      cutoff_epoch: Date.now() / 1000 - days * 86400,
    });
  } catch (err) {
    console.error('[Admin Purge Error]:', err.message);
    return res.status(500).json({ error: 'Retention purge failed.' });
  }
});

// --- 3. Server Startup & Background Periodic Cleaner ---
async function startServer() {
  // Initialize MySQL schema automatically
  const dbReady = await initDatabase();
  if (!dbReady) {
    console.warn('[Warning] Running with database uninitialized. Please start MySQL and check .env');
  }

  // Startup retention cleanup
  try {
    const initialPruned = await purgeExpiredSamples(RETENTION_DAYS);
    if (initialPruned > 0) {
      console.log(`[Startup] Purged ${initialPruned} sample(s) exceeding ${RETENTION_DAYS} days retention.`);
    }
  } catch (err) {
    console.warn('[Startup] Retention purge warning:', err.message);
  }

  // Periodic cleaner: runs every hour (3600 seconds)
  setInterval(async () => {
    try {
      const deleted = await purgeExpiredSamples(RETENTION_DAYS);
      if (deleted > 0) {
        console.log(`[Data Retention] Auto-deleted ${deleted} sample(s) older than ${RETENTION_DAYS} days.`);
      }
    } catch (err) {
      console.error('[Data Retention] Error during auto-cleanup:', err.message);
    }
  }, 3600 * 1000);

  // Bind to 0.0.0.0 so iOS devices on the local Wi-Fi network can reach the server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`  NetSpeed QoS Server (Node.js & MySQL) is running`);
    console.log(`  Listening on: http://0.0.0.0:${PORT}`);
    console.log(`  Test ping:    http://localhost:${PORT}/ping`);
    console.log(`====================================================`);
  });
}

startServer();
