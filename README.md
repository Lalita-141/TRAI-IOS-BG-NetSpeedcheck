# iPhone Network Speed Monitor

Continuously measures network speed on iPhone and uploads it with location to a server.

## Server (Node.js & MySQL)
```bash
cd server
npm install
npm run dev   # or npm start
```
- Configuration lives in `server/.env` (DB host, port, credentials, admin key).
- Schema is in `server/schema.sql` (also auto-verified on startup).
- `POST /v1/speed-samples` ingest (idempotent via `INSERT IGNORE`), `GET /v1/speed-samples` admin telemetry view.
- `/ping`, `/download?mb=2`, `/upload` are the high-throughput speed test endpoints.
- 90-day retention cleanup runs on startup and hourly via background worker.

### Legacy Python Server (Optional)
```bash
cd server
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## React Native iOS App (`mobile/`)
The full React Native implementation is in the [`mobile/`](file:///Users/rnt/Downloads/small-code/mobile) directory.
1. Run the app directly on iOS Simulator:
   ```bash
   cd mobile
   npm run ios
   ```
2. Or open the workspace in Xcode:
   ```bash
   cd mobile
   open ios/mobile.xcworkspace
   ```
3. Tap **Start Monitor** or **Test Now**.
4. Access settings via ⚙️ in the top bar to point the app to your LAN server IP (e.g. `http://192.168.1.10:8000`).

## Native SwiftUI iOS App (`ios/SpeedMonitor/`)
1. Xcode -> New Project -> iOS App (SwiftUI), name `SpeedMonitor`. Delete the generated App/ContentView files.
2. Drag all files from `ios/SpeedMonitor/` into the project.
3. Signing & Capabilities -> **+ Capability -> Background Modes** -> tick **Location updates** and **Background fetch**.
   Also add Info.plist key `BGTaskSchedulerPermittedIdentifiers` (array) with `com.example.speedmonitor.refresh`
   (change the id in `MonitorService.refreshID` to match your bundle id).
4. Info.plist keys:
   - `NSLocationWhenInUseUsageDescription`
   - `NSLocationAlwaysAndWhenInUseUsageDescription` (explain why: network coverage measurement)
   - For local `http://` testing: `NSAppTransportSecurity -> NSAllowsLocalNetworking = YES` (use HTTPS in production)
5. Edit `Config.swift`: set `server` to your PC's LAN IP.
6. Run on a **real device** (the simulator has no real radio or background behaviour). Tap Start, grant "Always".

## How it works
- Background location (plus significant-change relaunch) keeps the app alive. Each location callback triggers a test if `testIntervalSeconds` has elapsed (default 5 min).
- A test = 3x ping latency (median), 2 MB download, 1 MB upload, plus network type (Wi-Fi/cellular) and radio (LTE/5G).
- Samples go to a local file queue and are uploaded in batches. They are removed only after the server acks, and failed uploads retry on the next cycle.

## Caveats
- If the device is stationary, iOS may stop delivering location callbacks, so tests slow down. A `BGAppRefreshTask` fallback is included, but iOS decides when it runs (roughly every 15 min or more, not guaranteed), so intervals are never strict.
  To test it in Xcode, pause the app and run in the debugger: `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.example.speedmonitor.refresh"]`
- Cellular data use is about 3 MB per test. Set `wifiOnly` or raise the interval.
- App Store review needs a strong justification for "Always" location. Get user consent and support deletion requests.
- Not compiled or run here (no Xcode on Windows). Expect to fix small build issues on first build.
