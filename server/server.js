const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
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

// Serve static assets for the React Admin Dashboard
app.use('/admin', express.static(path.join(__dirname, 'public')));
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

// Video Streaming Latency Probe (Serves a chunked stream to measure initial buffering delay)
app.get('/test-video', (req, res) => {
  const videoBuffer = Buffer.alloc(1024 * 1024 * 2); // 2 MB synthetic video stream
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': videoBuffer.length,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });
  res.end(videoBuffer);
});

// Browsing Latency Probe (Returns a lightweight benchmark page to measure TTFB & Page Load Time)
app.get('/test-webpage', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Cache-Control': 'no-cache, no-store',
  });
  res.end(`<!DOCTYPE html><html><head><title>QoS Benchmark</title></head><body><h1>TRAI QoS Web Test</h1><p>Measuring TTFB and Render Timing.</p></body></html>`);
});

// Location Search Proxy for Map Screen (Free OpenStreetMap Nominatim Geocoding)
app.get('/v1/locations/search', (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query || query.length < 2) {
    return res.json([]);
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}&limit=5`;
  const options = {
    headers: {
      'User-Agent': 'NetSpeed QoS Monitor (info@handt.ai)',
    },
  };

  https
    .get(url, options, apiRes => {
      let data = '';
      apiRes.on('data', chunk => (data += chunk));
      apiRes.on('end', () => {
        try {
          const list = JSON.parse(data);
          const results = list.map(item => ({
            name: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }));
          res.json(results);
        } catch (e) {
          res.json([]);
        }
      });
    })
    .on('error', err => {
      res.json([]);
    });
});

// Reverse Geocoding Proxy (Translates GPS lat/lng to readable locality/city for mobile clients)
app.get('/v1/locations/reverse', (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng parameters are required' });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const options = {
    headers: {
      'User-Agent': 'NetSpeed QoS Monitor (info@handt.ai)',
      'Accept-Language': 'en',
    },
  };

  https
    .get(url, options, apiRes => {
      let data = '';
      apiRes.on('data', chunk => (data += chunk));
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const addr = parsed?.address || {};
          const area =
            addr.suburb ||
            addr.neighbourhood ||
            addr.quarter ||
            addr.village ||
            addr.city_district ||
            addr.road ||
            '';
          const city =
            addr.city ||
            addr.town ||
            addr.county ||
            addr.state_district ||
            addr.state ||
            '';
          const state = addr.state || '';
          const parts = [area, city].filter(Boolean);
          const displayName = parts.length > 0 ? parts.join(', ') : parsed.display_name || 'Local Area';

          res.json({
            area,
            city,
            state,
            display_name: displayName,
          });
        } catch (e) {
          res.json({ area: '', city: '', state: '', display_name: `Area (${parseFloat(lat).toFixed(2)}°, ${parseFloat(lng).toFixed(2)}°)` });
        }
      });
    })
    .on('error', () => {
      res.json({ area: '', city: '', state: '', display_name: `Area (${parseFloat(lat).toFixed(2)}°, ${parseFloat(lng).toFixed(2)}°)` });
    });
});

// --- 2. Middleware for Telemetry APIs ---
app.use(express.json({ limit: '10mb' }));

// Health Check & Service Info
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Network Speed Monitor Server (Node.js & MySQL)',
    admin_dashboard: '/admin',
    retention_period_days: RETENTION_DAYS,
    endpoints: {
      ping: '/ping',
      download: '/download?mb=2',
      upload: '/upload',
      test_video: '/test-video',
      test_webpage: '/test-webpage',
      crowdsource_map: '/v1/crowdsource/map',
      location_search: '/v1/locations/search?q=delhi',
      location_reverse: '/v1/locations/reverse?lat=18.52&lng=73.85',
      samples: '/v1/speed-samples',
      device_history: '/v1/devices/:device_id/history',
      nearby_coverage: '/v1/coverage/nearby?lat=18.52&lng=73.85',
      feedback: '/v1/feedback',
      app_config: '/v1/config/app',
      admin_stats: '/v1/admin/stats',
      admin_devices: '/v1/admin/devices',
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

// Ingest Batch of Speed, Video or Coverage Samples
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
    s.test_type || 'speed',
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
    s.video_delay_ms ?? null,
    s.web_delay_ms ?? null,
    s.page_load_sec ?? null,
    s.ttfb_ms ?? null,
    s.streaming_quality ?? null,
    s.buffering_rate ?? null,
    s.signal_dbm ?? null,
    s.signal_quality ?? null,
    s.cell_tower ?? null,
    s.frequency_band ?? null,
  ]);

  try {
    // Idempotent bulk insertion
    const insertSql = `
      INSERT IGNORE INTO samples (
        id, device_id, ts, test_type, down_mbps, up_mbps, latency_ms,
        jitter_ms, packet_loss_pct, network, radio, carrier,
        device_model, os_platform, location_type, lat, lng, accuracy,
        video_delay_ms, web_delay_ms, page_load_sec, ttfb_ms,
        streaming_quality, buffering_rate, signal_dbm, signal_quality,
        cell_tower, frequency_band
      ) VALUES ?
    `;
    await pool.query(insertSql, [rows]);

    // Opportunistic cleanup of expired records
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

// --- 3. Crowdsourced Map API (For Mobile App Map Screen) ---
app.get('/v1/crowdsource/map', async (req, res) => {
  const { operator, carrier, technology, radio, metric = 'Coverage', minLat, maxLat, minLng, maxLng } = req.query;
  const opFilter = operator || carrier;
  const techFilter = technology || radio;
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);

  const conditions = ['lat IS NOT NULL', 'lng IS NOT NULL'];
  const params = [];

  if (opFilter && opFilter.toLowerCase() !== 'all') {
    if (opFilter.toLowerCase() === 'wifi') {
      conditions.push('(LOWER(network) = "wifi" OR LOWER(radio) LIKE "%wi-fi%" OR LOWER(carrier) LIKE "%wifi%")');
    } else {
      conditions.push('LOWER(carrier) LIKE ?');
      params.push(`%${opFilter.toLowerCase()}%`);
    }
  }

  if (techFilter && techFilter.toLowerCase() !== 'all') {
    conditions.push('LOWER(radio) LIKE ?');
    params.push(`%${techFilter.toLowerCase()}%`);
  }

  if (minLat && maxLat && minLng && maxLng) {
    conditions.push('lat BETWEEN ? AND ?', 'lng BETWEEN ? AND ?');
    params.push(parseFloat(minLat), parseFloat(maxLat), parseFloat(minLng), parseFloat(maxLng));
  }

  const sql = `
    SELECT id, device_id, ts, down_mbps, up_mbps, latency_ms, jitter_ms,
           packet_loss_pct, network, radio, carrier, signal_dbm, signal_quality,
           lat, lng, accuracy, test_type
    FROM samples
    WHERE ${conditions.join(' AND ')}
    ORDER BY ts DESC
    LIMIT ?
  `;
  params.push(limit);

  try {
    const [rows] = await pool.query(sql, params);

    // Compute Color and Rating for each point based on selected metric
    const formatted = rows.map(r => {
      let metricValue = 0;
      let rating = 'Good';
      let color = '#F59E0B'; // Amber default

      const mLower = (metric || '').toLowerCase();
      if (mLower === 'download' || mLower === 'download speed') {
        metricValue = r.down_mbps || 0;
        if (metricValue >= 50) { rating = 'Excellent'; color = '#10B981'; }
        else if (metricValue >= 25) { rating = 'Better'; color = '#06B6D4'; }
        else if (metricValue >= 10) { rating = 'Good'; color = '#F59E0B'; }
        else { rating = 'Poor'; color = '#EF4444'; }
      } else if (mLower === 'upload' || mLower === 'upload speed') {
        metricValue = r.up_mbps || 0;
        if (metricValue >= 20) { rating = 'Excellent'; color = '#10B981'; }
        else if (metricValue >= 10) { rating = 'Better'; color = '#06B6D4'; }
        else if (metricValue >= 5) { rating = 'Good'; color = '#F59E0B'; }
        else { rating = 'Poor'; color = '#EF4444'; }
      } else if (mLower === 'latency') {
        metricValue = r.latency_ms || 999;
        if (metricValue < 25) { rating = 'Excellent'; color = '#10B981'; }
        else if (metricValue < 50) { rating = 'Better'; color = '#06B6D4'; }
        else if (metricValue < 100) { rating = 'Good'; color = '#F59E0B'; }
        else { rating = 'Poor'; color = '#EF4444'; }
      } else {
        // Coverage / Signal dBm (Default)
        metricValue = r.signal_dbm != null ? r.signal_dbm : (r.down_mbps && r.down_mbps > 25 ? -82 : -96);
        if (metricValue >= -85) { rating = 'Excellent'; color = '#10B981'; }
        else if (metricValue >= -95) { rating = 'Better'; color = '#06B6D4'; }
        else if (metricValue >= -105) { rating = 'Good'; color = '#F59E0B'; }
        else { rating = 'Poor'; color = '#EF4444'; }
      }

      return {
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        carrier: r.carrier || 'Unknown',
        radio: r.radio || 'Mobile',
        down_mbps: r.down_mbps,
        up_mbps: r.up_mbps,
        latency_ms: r.latency_ms,
        signal_dbm: r.signal_dbm,
        test_type: r.test_type,
        ts: r.ts,
        metric: metric,
        metric_value: metricValue,
        rating: rating,
        color: color,
      };
    });

    return res.json(formatted);
  } catch (err) {
    console.error('[Map API Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve crowdsourced map data.' });
  }
});

// --- 4. Admin Dashboard APIs ---

// High-Level KPIs
app.get('/v1/admin/stats', async (req, res) => {
  try {
    const todayTs = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

    const [totalRows] = await pool.query('SELECT COUNT(*) AS total, AVG(down_mbps) AS avg_down, AVG(up_mbps) AS avg_up, AVG(latency_ms) AS avg_lat FROM samples');
    const [deviceRows] = await pool.query('SELECT COUNT(DISTINCT device_id) AS total_devices FROM samples');
    const [todayRows] = await pool.query('SELECT COUNT(*) AS tests_today FROM samples WHERE ts >= ?', [todayTs]);
    const [topCarrierRows] = await pool.query('SELECT carrier, AVG(down_mbps) AS avg_speed FROM samples WHERE carrier IS NOT NULL AND carrier != "--" GROUP BY carrier ORDER BY avg_speed DESC LIMIT 1');

    return res.json({
      total_tests: totalRows[0]?.total || 0,
      total_devices: deviceRows[0]?.total_devices || 0,
      tests_today: todayRows[0]?.tests_today || 0,
      avg_down_mbps: totalRows[0]?.avg_down || 0,
      avg_up_mbps: totalRows[0]?.avg_up || 0,
      avg_latency_ms: totalRows[0]?.avg_lat || 0,
      top_carrier: topCarrierRows[0]?.carrier || 'Airtel',
    });
  } catch (err) {
    console.error('[Admin Stats Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch admin statistics.' });
  }
});

// Operator Speed Benchmarks
app.get('/v1/admin/operator-analytics', async (req, res) => {
  try {
    const sql = `
      SELECT carrier, radio, 
             AVG(down_mbps) AS avg_down, 
             AVG(up_mbps) AS avg_up, 
             AVG(latency_ms) AS avg_latency,
             COUNT(*) AS test_count
      FROM samples
      WHERE carrier IS NOT NULL AND carrier != '--' AND carrier != ''
      GROUP BY carrier, radio
      ORDER BY avg_down DESC
      LIMIT 10
    `;
    const [rows] = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error('[Operator Analytics Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch operator analytics.' });
  }
});

// Devices / Users Directory
app.get('/v1/admin/devices', async (req, res) => {
  const search = (req.query.search || '').trim();
  const conditions = ['device_id IS NOT NULL'];
  const params = [];

  if (search) {
    conditions.push('device_id LIKE ?');
    params.push(`%${search}%`);
  }

  const sql = `
    SELECT device_id,
           MAX(device_model) AS device_model,
           MAX(os_platform) AS os_platform,
           MAX(carrier) AS carrier,
           COUNT(*) AS total_tests,
           AVG(down_mbps) AS avg_down,
           AVG(latency_ms) AS avg_latency,
           MAX(ts) AS last_active
    FROM samples
    WHERE ${conditions.join(' AND ')}
    GROUP BY device_id
    ORDER BY last_active DESC
    LIMIT 100
  `;

  try {
    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error('[Admin Devices Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve devices.' });
  }
});

// Drill-Down: Specific Device Samples (Admin)
app.get('/v1/admin/devices/:device_id/samples', async (req, res) => {
  const cleanId = (req.params.device_id || '').trim();
  try {
    const [rows] = await pool.query('SELECT * FROM samples WHERE device_id = ? ORDER BY ts DESC LIMIT 100', [cleanId]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch device samples.' });
  }
});

// Cloud History Sync for Mobile Devices (No API Key Required)
app.get('/v1/devices/:device_id/history', async (req, res) => {
  const deviceId = (req.params.device_id || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

  if (!deviceId) {
    return res.status(400).json({ error: 'Invalid device_id.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM samples WHERE device_id = ? ORDER BY ts DESC LIMIT ?',
      [deviceId, limit]
    );
    return res.json({
      device_id: deviceId,
      count: rows.length,
      samples: rows,
    });
  } catch (err) {
    console.error('[Device History Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch device history.' });
  }
});

// Nearby Operator QoS Benchmark ("Best Operator in My Area")
app.get('/v1/coverage/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = Math.min(parseFloat(req.query.radius_km || '5'), 25);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Valid lat and lng query parameters are required.' });
  }

  // 1 degree of latitude is ~111km; longitude scaled by cos(lat)
  const deltaLat = radiusKm / 111.0;
  const latRad = (lat * Math.PI) / 180.0;
  const deltaLng = radiusKm / (111.0 * Math.cos(latRad) || 1.0);

  const minLat = lat - deltaLat;
  const maxLat = lat + deltaLat;
  const minLng = lng - deltaLng;
  const maxLng = lng + deltaLng;

  const sql = `
    SELECT carrier,
           COUNT(*) AS sample_count,
           AVG(down_mbps) AS avg_down_mbps,
           AVG(up_mbps) AS avg_up_mbps,
           AVG(latency_ms) AS avg_latency_ms,
           AVG(signal_dbm) AS avg_signal_dbm
    FROM samples
    WHERE lat BETWEEN ? AND ?
      AND lng BETWEEN ? AND ?
      AND carrier IS NOT NULL AND carrier != '' AND carrier != '--'
    GROUP BY carrier
    ORDER BY avg_down_mbps DESC
  `;

  try {
    const [rows] = await pool.query(sql, [minLat, maxLat, minLng, maxLng]);
    const formatted = rows.map((r, idx) => ({
      carrier: r.carrier,
      sample_count: r.sample_count,
      avg_down_mbps: parseFloat(Number(r.avg_down_mbps || 0).toFixed(1)),
      avg_up_mbps: parseFloat(Number(r.avg_up_mbps || 0).toFixed(1)),
      avg_latency_ms: Math.round(r.avg_latency_ms || 0),
      avg_signal_dbm: r.avg_signal_dbm != null ? Math.round(r.avg_signal_dbm) : null,
      rank: idx + 1,
      rating: idx === 0 ? 'Best' : idx === 1 ? 'Good' : 'Fair',
    }));

    return res.json({
      center: { lat, lng },
      radius_km: radiusKm,
      total_nearby_samples: rows.reduce((acc, curr) => acc + curr.sample_count, 0),
      operators: formatted,
    });
  } catch (err) {
    console.error('[Nearby Coverage Error]:', err.message);
    return res.status(500).json({ error: 'Failed to compute nearby operator performance.' });
  }
});

// Submit User Telecom Feedback or Coverage Complaint
app.post('/v1/feedback', async (req, res) => {
  const { device_id, carrier, rating, category, comment, lat, lng } = req.body;
  if (!device_id || rating == null) {
    return res.status(400).json({ error: 'device_id and rating are required' });
  }

  const feedbackId = 'fb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const sql = `
    INSERT INTO feedback (id, device_id, carrier, rating, category, comment, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    await pool.query(sql, [
      feedbackId,
      device_id,
      carrier || null,
      parseInt(rating, 10),
      category || 'General',
      comment || '',
      lat != null ? parseFloat(lat) : null,
      lng != null ? parseFloat(lng) : null,
    ]);
    return res.json({ status: 'success', id: feedbackId });
  } catch (err) {
    console.error('[Feedback Insert Error]:', err.message);
    return res.status(500).json({ error: 'Failed to record feedback.' });
  }
});

// View Feedback & Complaints for Admin Dashboard
app.get('/v1/admin/feedback', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  try {
    const [rows] = await pool.query('SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?', [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch feedback logs.' });
  }
});

// Dynamic Client App Remote Configuration
app.get('/v1/config/app', (req, res) => {
  res.json({
    min_app_version: '1.0.0',
    latest_app_version: '1.2.0',
    force_update: false,
    maintenance_mode: false,
    default_download_mb: 2,
    default_upload_mb: 1,
    default_interval_seconds: 300,
    wifi_only: false,
    announcement: null,
  });
});

// Filterable Telemetry Samples
app.get('/v1/admin/samples', async (req, res) => {
  const { search, carrier, radio, test_type } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

  const conditions = ['1=1'];
  const params = [];

  if (search) {
    conditions.push('(device_id LIKE ? OR id LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (carrier) {
    conditions.push('LOWER(carrier) LIKE ?');
    params.push(`%${carrier.toLowerCase()}%`);
  }
  if (radio) {
    conditions.push('LOWER(radio) LIKE ?');
    params.push(`%${radio.toLowerCase()}%`);
  }
  if (test_type) {
    conditions.push('test_type = ?');
    params.push(test_type);
  }

  const sql = `
    SELECT * FROM samples
    WHERE ${conditions.join(' AND ')}
    ORDER BY ts DESC
    LIMIT ?
  `;
  params.push(limit);

  try {
    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch samples.' });
  }
});

// CSV Export for Reporting
app.get('/v1/admin/export', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM samples ORDER BY ts DESC LIMIT 5000');
    if (rows.length === 0) {
      return res.status(404).send('No data available to export.');
    }

    const headers = Object.keys(rows[0]).join(',');
    const csvLines = rows.map(r =>
      Object.values(r)
        .map(v => (v === null ? '' : `"${String(v).replace(/"/g, '""')}"`))
        .join(',')
    );

    const csvContent = [headers, ...csvLines].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="TRAI_MySpeed_Telemetry_Report.csv"');
    return res.send(csvContent);
  } catch (err) {
    console.error('[CSV Export Error]:', err.message);
    return res.status(500).send('CSV export failed.');
  }
});

// Legacy raw query for backwards compatibility
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
    return res.status(500).json({ error: 'Failed to retrieve telemetry records.' });
  }
});

// Public Data Retention Policy Disclosure
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

// --- 5. Server Startup & Background Periodic Cleaner ---
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
    console.log(`  TRAI MySpeed QoS Server (Node.js & MySQL) is running`);
    console.log(`  Listening on:     http://0.0.0.0:${PORT}`);
    console.log(`  Admin Dashboard:  http://localhost:${PORT}/admin`);
    console.log(`  Crowdsource Map:  http://localhost:${PORT}/v1/crowdsource/map`);
    console.log(`====================================================`);
  });
}

startServer();
