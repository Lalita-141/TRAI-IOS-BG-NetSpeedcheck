"""Speed sample ingest server. Run: uvicorn main:app --host 0.0.0.0 --port 8000"""
import sqlite3
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB = "samples.db"
app = FastAPI(title="Network Speed Monitor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Network Speed Monitor Server",
        "endpoints": {
            "docs": "/docs",
            "ping": "/ping",
            "download": "/download?mb=2",
            "upload": "/upload",
            "samples": "/v1/speed-samples"
        }
    }


def db():
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS samples(
        id TEXT PRIMARY KEY, device_id TEXT, ts REAL,
        down_mbps REAL, up_mbps REAL, latency_ms REAL,
        jitter_ms REAL, packet_loss_pct REAL,
        network TEXT, radio TEXT, carrier TEXT,
        device_model TEXT, os_platform TEXT, location_type TEXT,
        lat REAL, lng REAL, accuracy REAL)""")
    # Add columns if migrating from older schema
    for col, col_type in [
        ("carrier", "TEXT"),
        ("jitter_ms", "REAL"),
        ("packet_loss_pct", "REAL"),
        ("device_model", "TEXT"),
        ("os_platform", "TEXT"),
        ("location_type", "TEXT")
    ]:
        try:
            c.execute(f"ALTER TABLE samples ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass
    return c


class Sample(BaseModel):
    id: str
    device_id: str
    ts: float
    down_mbps: float | None = None
    up_mbps: float | None = None
    latency_ms: float | None = None
    jitter_ms: float | None = None
    packet_loss_pct: float | None = None
    network: str | None = None
    radio: str | None = None
    carrier: str | None = None
    device_model: str | None = None
    os_platform: str | None = None
    location_type: str | None = None
    lat: float | None = None
    lng: float | None = None
    accuracy: float | None = None


class Batch(BaseModel):
    samples: list[Sample]


@app.post("/v1/speed-samples")
def ingest(b: Batch):
    c = db()
    # INSERT OR IGNORE makes retries idempotent by sample id
    c.executemany(
        """INSERT OR IGNORE INTO samples (
            id, device_id, ts, down_mbps, up_mbps, latency_ms,
            jitter_ms, packet_loss_pct, network, radio, carrier,
            device_model, os_platform, location_type, lat, lng, accuracy
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [(s.id, s.device_id, s.ts, s.down_mbps, s.up_mbps, s.latency_ms,
          s.jitter_ms, s.packet_loss_pct, s.network, s.radio, s.carrier,
          s.device_model, s.os_platform, s.location_type, s.lat, s.lng, s.accuracy) for s in b.samples])
    c.commit()
    return {"accepted": len(b.samples)}


@app.get("/v1/speed-samples")
def list_samples(limit: int = 200):
    c = db()
    c.row_factory = sqlite3.Row
    rows = c.execute("SELECT * FROM samples ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


# --- endpoints the phone measures against ---
@app.get("/ping")
def ping():
    return Response(b"ok")


@app.get("/download")
def download(mb: int = 2):
    return Response(b"\0" * (min(mb, 20) * 1024 * 1024), media_type="application/octet-stream")


@app.post("/upload")
async def upload(request: Request):
    n = len(await request.body())
    return {"received": n}
