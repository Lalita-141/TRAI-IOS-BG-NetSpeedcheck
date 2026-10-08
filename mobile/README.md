# Speed Monitor - React Native iOS App

A high-performance React Native iOS application for continuous network telemetry and speed testing with background location tracking and batched offline queue persistence.

---

## 🚀 Quick Start (Running for iOS)

### 1. Start the FastAPI Ingest Server
In a terminal window:
```bash
cd /Users/rnt/Downloads/small-code/server
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```
> **Note:** The server endpoints are:
> - `GET /ping` - Used for median round-trip latency measurements
> - `GET /download?mb=2` - Generates payload to measure download throughput (Mbps)
> - `POST /upload` - Receives binary payload to measure upload throughput (Mbps)
> - `POST /v1/speed-samples` - Ingests batched samples (idempotent by sample ID)
> - `GET /v1/speed-samples` - View ingested samples

---

### 2. Run the React Native iOS App

In another terminal window:
```bash
cd /Users/rnt/Downloads/small-code/mobile
npm run ios
```

#### Alternatively, Open in Xcode:
```bash
open ios/mobile.xcworkspace
```
Select your target simulator or connected iPhone device and click **Run** (Cmd + R).

---

## 📱 Features

- **Live Speedometer Gauge**: Circular SVG arc meter displaying real-time download Mbps, upload Mbps, ping latency, and test progress.
- **Speed Test Engine**:
  - **Latency**: 3x ping median calculation to `/ping`.
  - **Download**: High-precision throughput calculation from `/download`.
  - **Upload**: Binary buffer stream throughput calculation to `/upload`.
- **Network & Radio Telemetry**: Automatic detection of Wi-Fi vs Cellular, Carrier info, and cellular radio generation (5G / 4G LTE / 3G).
- **GPS Coordinates & Accuracy**: Records latitude, longitude, and accuracy with each test sample.
- **Offline Persistent Queue**: Samples are stored in local storage (`AsyncStorage`) and uploaded in batches to the backend. Samples are only removed from local storage after server acknowledgement (HTTP 200).
- **Background Tracking**: Configured with iOS Background Location Updates and Background Fetch capabilities.
- **Dynamic In-App Settings**: Configure server endpoint, interval cadence (30s, 1m, 5m, 15m, 30m), download payload size, upload payload size, and Wi-Fi only mode directly from the app UI.
- **Sample History Log**: View past measurements and GPS coordinates in the sample history modal.

---

## 🛠 Project Structure

```
mobile/
├── App.tsx                       # Main application view & state orchestrator
├── src/
│   ├── types/index.ts            # TypeScript interfaces (Sample, AppConfig, etc.)
│   ├── config/index.ts           # Persistent config manager (server URL, intervals)
│   ├── utils/uuid.ts             # RFC4122 v4 UUID generator
│   ├── services/
│   │   ├── speedTester.ts        # Ping, Download, Upload & Network context engine
│   │   ├── locationService.ts    # iOS Geolocation & permissions manager
│   │   ├── sampleStore.ts        # Persistent queue & history store
│   │   ├── uploader.ts           # Batch upload to /v1/speed-samples
│   │   └── monitorService.ts     # Background intervals & event subscribers
│   └── components/
│       ├── SpeedGauge.tsx        # Modern SVG speedometer gauge
│       ├── MetricCard.tsx        # Telemetry & metric glassmorphism cards
│       ├── SettingsModal.tsx     # In-app configuration modal
│       └── HistoryModal.tsx      # Past samples log viewer
└── ios/
    ├── Podfile                   # CocoaPods configuration
    └── mobile/
        └── Info.plist            # Background modes & location permissions
```
