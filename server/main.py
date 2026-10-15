import os
import sqlite3
import time
import asyncio
from fastapi import FastAPI, Request, Response, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB = "samples.db"
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "netspeed-admin-2026")
RETENTION_DAYS = 90
RETENTION_SECONDS = RETENTION_DAYS * 86400  # 90 days in seconds = 7,776,000s

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
        "retention_period_days": RETENTION_DAYS,
        "endpoints": {
            "docs": "/docs",
            "ping": "/ping",
            "download": "/download?mb=2",
            "upload": "/upload",
            "samples": "/v1/speed-samples",
            "data_retention": "/v1/privacy/data-retention"
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
    # Add indexes for fast queries and retention pruning
    c.execute("CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_samples_device_id ON samples(device_id)")
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


def purge_expired_samples(days: int = RETENTION_DAYS) -> int:
    """
    Deletes network measurement records older than the retention limit (default: 90 days).
    Returns the number of deleted records.
    """
    cutoff_ts = time.time() - (days * 86400)
    c = db()
    try:
        cur = c.execute("DELETE FROM samples WHERE ts < ?", (cutoff_ts,))
        deleted = cur.rowcount
        c.commit()
        return deleted
    finally:
        c.close()


async def periodic_retention_cleaner():
    """Background worker executing hourly to prune records older than 90 days."""
    while True:
        try:
            deleted = purge_expired_samples(RETENTION_DAYS)
            if deleted > 0:
                print(f"[Data Retention] Auto-deleted {deleted} sample(s) older than {RETENTION_DAYS} days.")
        except Exception as e:
            print(f"[Data Retention] Error during auto-cleanup: {e}")
        await asyncio.sleep(3600)  # Hourly check


@app.on_event("startup")
async def startup_retention_event():
    """Runs retention cleanup on server startup and initiates periodic cleaner."""
    try:
        deleted = purge_expired_samples(RETENTION_DAYS)
        if deleted > 0:
            print(f"[Startup] Purged {deleted} sample(s) exceeding {RETENTION_DAYS} days retention.")
    except Exception as e:
        print(f"[Startup] Retention purge error: {e}")
    asyncio.create_task(periodic_retention_cleaner())


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
    try:
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
        # Opportunistic cleanup: remove records older than 90 days
        cutoff_ts = time.time() - RETENTION_SECONDS
        cur = c.execute("DELETE FROM samples WHERE ts < ?", (cutoff_ts,))
        pruned_count = cur.rowcount
        c.commit()
        return {"accepted": len(b.samples), "pruned_expired": pruned_count}
    finally:
        c.close()


@app.get("/v1/speed-samples")
def list_samples(
    limit: int = 200,
    api_key: str = Query(None),
    x_admin_key: str = Header(None)
):
    key = x_admin_key or api_key
    if not key or key != ADMIN_API_KEY:
        raise HTTPException(
            status_code=403,
            detail="Access restricted: Unauthorized to access raw telemetry and location records."
        )
    c = db()
    try:
        c.row_factory = sqlite3.Row
        rows = c.execute("SELECT * FROM samples ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        c.close()


@app.get("/v1/privacy/data-retention")
def data_retention_info():
    """
    Public disclosure endpoint providing exact data retention & deletion terms for users & Apple Review.
    """
    return {
        "policy_title": "Data Retention and Deletion",
        "retention_period_days": RETENTION_DAYS,
        "retention_period_seconds": RETENTION_SECONDS,
        "retention_statement": (
            f"NetSpeed QoS Monitor retains network measurement records on its backend for up to "
            f"{RETENTION_DAYS} days from the date they are recorded. Records older than this period "
            "are automatically deleted through our data-retention process."
        ),
        "deletion_request_statement": (
            "Users may request deletion of their measurement records by contacting "
            "privacy@hareandturtle.ai. We will process verified requests in accordance with applicable law."
        ),
        "app_deletion_statement": (
            "Deleting the App does not automatically delete records already transmitted to our backend. "
            "Users may contact us to request deletion of server-side records. Backup copies, where applicable, "
            "are managed according to our backup-retention procedures and applicable legal requirements."
        ),
        "contact_email": "privacy@hareandturtle.ai",
        "mail_to_request": "mailto:privacy@hareandturtle.ai?subject=Data%20Deletion%20Request",
        "automated_cleanup_enabled": True
    }


@app.delete("/v1/speed-samples/device/{device_id}")
def delete_device_records(device_id: str):
    """
    Allows users to request immediate deletion of their server-side measurement records.
    """
    clean_id = device_id.strip()
    if not clean_id or len(clean_id) < 3:
        raise HTTPException(status_code=400, detail="Invalid device_id provided.")
    c = db()
    try:
        cur = c.execute("DELETE FROM samples WHERE device_id = ?", (clean_id,))
        deleted_count = cur.rowcount
        c.commit()
        return {
            "status": "success",
            "device_id": clean_id,
            "deleted_count": deleted_count,
            "message": f"Successfully deleted {deleted_count} measurement record(s) for device {clean_id}."
        }
    finally:
        c.close()


@app.post("/v1/admin/retention-purge")
def trigger_retention_purge(
    days: int = Query(RETENTION_DAYS, ge=1, le=365),
    api_key: str = Query(None),
    x_admin_key: str = Header(None)
):
    key = x_admin_key or api_key
    if not key or key != ADMIN_API_KEY:
        raise HTTPException(
            status_code=403,
            detail="Unauthorized: Admin API key required."
        )
    deleted = purge_expired_samples(days)
    return {
        "status": "success",
        "retention_days": days,
        "deleted_records": deleted,
        "cutoff_epoch": time.time() - (days * 86400)
    }


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
