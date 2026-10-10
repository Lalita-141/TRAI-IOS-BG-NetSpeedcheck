const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const db = new Database('samples.db');

// Ensure tables exist
db.exec(`CREATE TABLE IF NOT EXISTS samples(
    id TEXT PRIMARY KEY, device_id TEXT, ts REAL,
    down_mbps REAL, up_mbps REAL, latency_ms REAL,
    jitter_ms REAL, packet_loss_pct REAL,
    network TEXT, radio TEXT, carrier TEXT,
    device_model TEXT, os_platform TEXT, location_type TEXT,
    lat REAL, lng REAL, accuracy REAL)`);

// Add columns if migrating from older schema
const newColumns = [
    ["carrier", "TEXT"],
    ["jitter_ms", "REAL"],
    ["packet_loss_pct", "REAL"],
    ["device_model", "TEXT"],
    ["os_platform", "TEXT"],
    ["location_type", "TEXT"]
];

for (const [col, colType] of newColumns) {
    try {
        db.exec(`ALTER TABLE samples ADD COLUMN ${col} ${colType}`);
    } catch (err) {
        // Ignore if column already exists (sqlite3.OperationalError)
    }
}

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON for standard API endpoints
app.use('/v1/speed-samples', express.json());

// 1. Root Status Endpoint
app.get('/', (req, res) => {
    res.json({
        status: "online",
        service: "Network Speed Monitor Server",
        endpoints: {
            docs: "/docs",
            ping: "/ping",
            download: "/download?mb=2",
            upload: "/upload",
            samples: "/v1/speed-samples"
        }
    });
});

// 2. Ping Endpoint
app.get('/ping', (req, res) => {
    res.send("ok");
});

// 3. Download Endpoint
app.get('/download', (req, res) => {
    let mb = parseInt(req.query.mb) || 2;
    mb = Math.min(mb, 20); // Cap at 20MB
    const buffer = Buffer.alloc(mb * 1024 * 1024);
    res.set('Content-Type', 'application/octet-stream');
    res.send(buffer);
});

// 4. Upload Endpoint (uses raw body parsing)
app.post('/upload', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
    const length = req.body ? req.body.length : 0;
    res.json({ received: length });
});

// 5. Get Samples
app.get('/v1/speed-samples', (req, res) => {
    const limit = parseInt(req.query.limit) || 200;
    const stmt = db.prepare('SELECT * FROM samples ORDER BY ts DESC LIMIT ?');
    const rows = stmt.all(limit);
    res.json(rows);
});

// 6. Ingest Samples
app.post('/v1/speed-samples', (req, res) => {
    const samples = req.body.samples || [];
    
    // Create an insert statement with COALESCE or ignore missing fields using placeholders
    const insert = db.prepare(`
        INSERT OR IGNORE INTO samples (
            id, device_id, ts, down_mbps, up_mbps, latency_ms,
            jitter_ms, packet_loss_pct, network, radio, carrier,
            device_model, os_platform, location_type, lat, lng, accuracy
        ) VALUES (
            @id, @device_id, @ts, @down_mbps, @up_mbps, @latency_ms,
            @jitter_ms, @packet_loss_pct, @network, @radio, @carrier,
            @device_model, @os_platform, @location_type, @lat, @lng, @accuracy
        )
    `);

    // Run in a transaction for performance
    const insertMany = db.transaction((samplesToInsert) => {
        for (const sample of samplesToInsert) {
            // Replace undefined values with null
            const cleanSample = {
                id: sample.id,
                device_id: sample.device_id,
                ts: sample.ts,
                down_mbps: sample.down_mbps ?? null,
                up_mbps: sample.up_mbps ?? null,
                latency_ms: sample.latency_ms ?? null,
                jitter_ms: sample.jitter_ms ?? null,
                packet_loss_pct: sample.packet_loss_pct ?? null,
                network: sample.network ?? null,
                radio: sample.radio ?? null,
                carrier: sample.carrier ?? null,
                device_model: sample.device_model ?? null,
                os_platform: sample.os_platform ?? null,
                location_type: sample.location_type ?? null,
                lat: sample.lat ?? null,
                lng: sample.lng ?? null,
                accuracy: sample.accuracy ?? null
            };
            insert.run(cleanSample);
        }
    });

    insertMany(samples);
    res.json({ accepted: samples.length });
});

// Start the server
const port = 8000;
app.listen(port, '0.0.0.0', () => {
    console.log(`Node.js Network Speed Monitor Server listening on port ${port}`);
});
