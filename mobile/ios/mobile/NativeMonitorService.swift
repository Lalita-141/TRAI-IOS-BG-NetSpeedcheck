import Foundation
import CoreLocation
import UIKit
import CoreTelephony
import Network
import React
import BackgroundTasks

final class NativeMonitorService: NSObject, CLLocationManagerDelegate {
    static let shared = NativeMonitorService()
    
    private let lm = CLLocationManager()
    private var lastTestTime: Date = Date.distantPast
    private var isTesting = false
    private var isMonitoring = false
    private var intervalSeconds: TimeInterval = 10.0 // 10s for rapid background & killed state verification
    private var serverUrlString: String = "https://netspeed.handt.ai"
    private let pathMonitor = NWPathMonitor()

    // While a JS test (continuous / scheduled / manual) holds this lease, native tests are skipped
    // so two speed tests never share the radio. Expires on its own if JS gets suspended.
    private var jsTestLeaseUntil: Date = .distantPast

    private let defaults = UserDefaults.standard
    private let monitoringEnabledKey = "nm_monitoring_enabled"
    private let scheduleFrequencyKey = "nm_schedule_frequency"
    private let scheduleFromKey = "nm_schedule_from_ts"
    private let scheduleToKey = "nm_schedule_to_ts"
    private let scheduleServerUrlKey = "nm_schedule_server_url"
    private let scheduleLastPeriodKey = "nm_schedule_last_period"
    private let scheduleLastRunAtKey = "nm_schedule_last_run_at"
    private let scheduleHourKey = "nm_schedule_hour"
    private let scheduleMinuteKey = "nm_schedule_minute"
    private let scheduleWeekdayKey = "nm_schedule_weekday"
    private let scheduleMonthDayKey = "nm_schedule_month_day"

    private var configuredDeviceId: String {
        get {
            if let saved = UserDefaults.standard.string(forKey: "netspeed_device_id"), !saved.isEmpty {
                return saved
            }
            let vendorId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
            UserDefaults.standard.set(vendorId, forKey: "netspeed_device_id")
            return vendorId
        }
        set {
            UserDefaults.standard.set(newValue, forKey: "netspeed_device_id")
        }
    }
    
    private override init() {
        super.init()
        pathMonitor.start(queue: DispatchQueue(label: "NativeMonitorService.path"))
        lm.delegate = self
        lm.desiredAccuracy = kCLLocationAccuracyBest
        lm.distanceFilter = kCLDistanceFilterNone // Continuous updates even stationary
        lm.pausesLocationUpdatesAutomatically = false
        if #available(iOS 9.0, *) {
            lm.allowsBackgroundLocationUpdates = true
        }
        if #available(iOS 11.0, *) {
            lm.showsBackgroundLocationIndicator = true
        }
    }
    
    func configure(serverUrl: String, interval: Double, deviceId: String? = nil) {
        self.serverUrlString = serverUrl
        self.intervalSeconds = max(interval, 5.0)
        if let dId = deviceId, !dId.isEmpty {
            self.configuredDeviceId = dId
        }
    }
    
    func getDeviceId() -> String {
        return configuredDeviceId
    }
    
    func startMonitoring() {
        guard !isMonitoring else { return }
        isMonitoring = true
        defaults.set(true, forKey: monitoringEnabledKey)

        lm.requestAlwaysAuthorization()
        lm.startUpdatingLocation()
        lm.startMonitoringSignificantLocationChanges() // Relaunches app from killed state!
        
        scheduleAppRefresh()
        
        // Trigger immediate test
        runTest(location: lm.location)
    }
    
    func stopMonitoring() {
        isMonitoring = false
        defaults.set(false, forKey: monitoringEnabledKey)
        lm.stopUpdatingLocation()
        lm.stopMonitoringSignificantLocationChanges()
    }
    
    func isRunning() -> Bool {
        return isMonitoring
    }
    
    func scheduleAppRefresh() {
        if #available(iOS 13.0, *) {
            let request = BGAppRefreshTaskRequest(identifier: "com.rnt.speedmonitor.refresh")
            var earliest = Date(timeIntervalSinceNow: 15 * 60)
            // Ask iOS to wake us at the next scheduled run time (iOS still decides the exact moment)
            let monitoringEnabled = isMonitoring || defaults.bool(forKey: monitoringEnabledKey)
            if let nextRun = nextScheduleRunDate(), !monitoringEnabled || nextRun < earliest {
                earliest = max(nextRun, Date(timeIntervalSinceNow: 60))
            }
            request.earliestBeginDate = earliest
            try? BGTaskScheduler.shared.submit(request)
        }
    }
    
    @available(iOS 13.0, *)
    func handleBackgroundAppRefresh(task: BGAppRefreshTask) {
        scheduleAppRefresh()
        task.expirationHandler = { () -> Void in
            task.setTaskCompleted(success: false)
        }

        let duePeriod = dueSchedulePeriod()
        let monitoringEnabled = isMonitoring || defaults.bool(forKey: monitoringEnabledKey)

        // A JS test is running, or this is a schedule-only wake-up with nothing due yet
        if isJsTestActive || (hasActiveSchedule && !monitoringEnabled && duePeriod == nil) {
            task.setTaskCompleted(success: true)
            return
        }

        if duePeriod != nil, !isMonitoring, let scheduleUrl = defaults.string(forKey: scheduleServerUrlKey) {
            serverUrlString = scheduleUrl
        }

        Task {
            await self.performSpeedTestAndUpload(
                location: self.lm.location,
                testType: duePeriod != nil ? "scheduled" : nil
            )
            // Re-aim the next wake-up now that this run is recorded
            self.scheduleAppRefresh()
            task.setTaskCompleted(success: true)
        }
    }

    // MARK: - JS test lease

    func setJsTestLease(seconds: Double) {
        jsTestLeaseUntil = seconds > 0 ? Date().addingTimeInterval(seconds) : .distantPast
    }

    private var isJsTestActive: Bool {
        return Date() < jsTestLeaseUntil
    }

    // MARK: - Scheduled test (runs from BGAppRefreshTask while the app is closed)

    private var hasActiveSchedule: Bool {
        return defaults.string(forKey: scheduleFrequencyKey) != nil
    }

    func setSchedule(frequency: String, fromTs: Double, toTs: Double, hour: Int, minute: Int, weekday: Int, monthDay: Int,
                     serverUrl: String, deviceId: String?) {
        defaults.set(frequency, forKey: scheduleFrequencyKey)
        defaults.set(fromTs, forKey: scheduleFromKey)
        defaults.set(toTs, forKey: scheduleToKey)
        defaults.set(hour, forKey: scheduleHourKey)
        defaults.set(minute, forKey: scheduleMinuteKey)
        defaults.set(weekday, forKey: scheduleWeekdayKey)
        defaults.set(monthDay, forKey: scheduleMonthDayKey)
        defaults.set(serverUrl, forKey: scheduleServerUrlKey)
        defaults.removeObject(forKey: scheduleLastPeriodKey)
        defaults.removeObject(forKey: scheduleLastRunAtKey)
        if let dId = deviceId, !dId.isEmpty {
            configuredDeviceId = dId
        }
        scheduleAppRefresh()
    }

    func clearSchedule() {
        for key in [scheduleFrequencyKey, scheduleFromKey, scheduleToKey, scheduleServerUrlKey,
                    scheduleLastPeriodKey, scheduleLastRunAtKey, scheduleHourKey, scheduleMinuteKey,
                    scheduleWeekdayKey, scheduleMonthDayKey] {
            defaults.removeObject(forKey: key)
        }
    }

    func markScheduledRun(period: Int, at: Double) {
        defaults.set(period, forKey: scheduleLastPeriodKey)
        defaults.set(at, forKey: scheduleLastRunAtKey)
        scheduleAppRefresh()
    }

    func scheduleState() -> [String: Any] {
        let lastPeriod = defaults.object(forKey: scheduleLastPeriodKey) != nil
            ? defaults.integer(forKey: scheduleLastPeriodKey) : -1
        return [
            "active": hasActiveSchedule,
            "lastRunPeriod": lastPeriod,
            "lastRunAt": defaults.double(forKey: scheduleLastRunAtKey),
            "isTesting": isTesting,
        ]
    }

    // Run-time math below must match latestOccurrence / nextOccurrence / occurrenceId
    // in scheduledTestService.ts. A run slot's id is its time in minutes since epoch.

    private struct ScheduleTiming {
        let frequency: String
        let hour: Int
        let minute: Int
        let weekday: Int // 0 = Sunday ... 6 = Saturday
        let monthDay: Int // 1-31, clamped to the month's last day
    }

    private var scheduleTiming: ScheduleTiming? {
        guard let frequency = defaults.string(forKey: scheduleFrequencyKey) else { return nil }
        return ScheduleTiming(
            frequency: frequency,
            hour: defaults.integer(forKey: scheduleHourKey),
            minute: defaults.integer(forKey: scheduleMinuteKey),
            weekday: defaults.integer(forKey: scheduleWeekdayKey),
            monthDay: max(1, defaults.integer(forKey: scheduleMonthDayKey))
        )
    }

    private func at(_ day: Date, _ t: ScheduleTiming) -> Date {
        return Calendar.current.date(bySettingHour: t.hour, minute: t.minute, second: 0, of: day) ?? day
    }

    private func monthOccurrence(_ month: DateComponents, _ t: ScheduleTiming) -> Date {
        let cal = Calendar.current
        let first = cal.date(from: DateComponents(year: month.year, month: month.month, day: 1)) ?? Date()
        let daysInMonth = cal.range(of: .day, in: .month, for: first)?.count ?? 28
        let comps = DateComponents(year: month.year, month: month.month, day: min(t.monthDay, daysInMonth),
                                   hour: t.hour, minute: t.minute, second: 0)
        return cal.date(from: comps) ?? first
    }

    private func shiftMonth(_ month: DateComponents, by value: Int) -> DateComponents {
        let cal = Calendar.current
        let first = cal.date(from: DateComponents(year: month.year, month: month.month, day: 1)) ?? Date()
        let shifted = cal.date(byAdding: .month, value: value, to: first) ?? first
        return cal.dateComponents([.year, .month], from: shifted)
    }

    /// Most recent scheduled run time at or before `date`.
    private func scheduleOccurrence(onOrBefore date: Date, _ t: ScheduleTiming) -> Date {
        let cal = Calendar.current
        let today = cal.startOfDay(for: date)
        switch t.frequency {
        case "monthly":
            let thisMonth = cal.dateComponents([.year, .month], from: date)
            let c = monthOccurrence(thisMonth, t)
            return c <= date ? c : monthOccurrence(shiftMonth(thisMonth, by: -1), t)
        case "weekly":
            let diff = ((cal.component(.weekday, from: date) - 1) - t.weekday + 7) % 7
            let day = cal.date(byAdding: .day, value: -diff, to: today) ?? today
            let c = at(day, t)
            return c <= date ? c : at(cal.date(byAdding: .day, value: -7, to: day) ?? day, t)
        default:
            let c = at(today, t)
            return c <= date ? c : at(cal.date(byAdding: .day, value: -1, to: today) ?? today, t)
        }
    }

    /// First scheduled run time strictly after `date`.
    private func scheduleOccurrence(after date: Date, _ t: ScheduleTiming) -> Date {
        let cal = Calendar.current
        let today = cal.startOfDay(for: date)
        switch t.frequency {
        case "monthly":
            let thisMonth = cal.dateComponents([.year, .month], from: date)
            let c = monthOccurrence(thisMonth, t)
            return c > date ? c : monthOccurrence(shiftMonth(thisMonth, by: 1), t)
        case "weekly":
            let diff = (t.weekday - (cal.component(.weekday, from: date) - 1) + 7) % 7
            let day = cal.date(byAdding: .day, value: diff, to: today) ?? today
            let c = at(day, t)
            return c > date ? c : at(cal.date(byAdding: .day, value: 7, to: day) ?? day, t)
        default:
            let c = at(today, t)
            return c > date ? c : at(cal.date(byAdding: .day, value: 1, to: today) ?? today, t)
        }
    }

    /// Id of the run slot that should be handled now, or nil if nothing is due.
    private func dueSchedulePeriod(now: Date = Date()) -> Int? {
        guard let t = scheduleTiming else { return nil }
        let from = Date(timeIntervalSince1970: defaults.double(forKey: scheduleFromKey))
        let to = Date(timeIntervalSince1970: defaults.double(forKey: scheduleToKey))
        guard now >= from, now <= to else { return nil }
        let latest = scheduleOccurrence(onOrBefore: now, t)
        guard latest >= from else { return nil }
        let id = Int(floor(latest.timeIntervalSince1970 / 60))
        if defaults.object(forKey: scheduleLastPeriodKey) != nil,
           defaults.integer(forKey: scheduleLastPeriodKey) == id {
            return nil
        }
        return id
    }

    /// When the next scheduled run should happen (now if one is due), or nil if the schedule is over.
    private func nextScheduleRunDate(now: Date = Date()) -> Date? {
        guard let t = scheduleTiming else { return nil }
        let from = Date(timeIntervalSince1970: defaults.double(forKey: scheduleFromKey))
        let to = Date(timeIntervalSince1970: defaults.double(forKey: scheduleToKey))
        guard now <= to else { return nil }
        if dueSchedulePeriod(now: now) != nil { return now }
        let next = scheduleOccurrence(after: max(now, from.addingTimeInterval(-1)), t)
        return next <= to ? next : nil
    }
    
    func handleRelaunch(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
        // If iOS relaunched the app due to location events from killed state:
        if launchOptions?[.location] != nil {
            NSLog("[NativeMonitorService] App relaunched from KILLED state by iOS Location Event!")
            // Continuous / scheduled tests can relaunch the app too: only resume monitoring if it was on.
            // Those features are resumed by JS, which also starts on a background relaunch.
            if defaults.bool(forKey: monitoringEnabledKey) {
                startMonitoring()
                runTest(location: lm.location)
            } else if dueSchedulePeriod() != nil {
                if let scheduleUrl = defaults.string(forKey: scheduleServerUrlKey) {
                    serverUrlString = scheduleUrl
                }
                runTest(location: lm.location, testType: "scheduled")
            }
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        let elapsed = Date().timeIntervalSince(lastTestTime)
        if elapsed >= intervalSeconds {
            runTest(location: loc)
        } else if dueSchedulePeriod() != nil {
            // Monitoring keeps the app awake: run the scheduled test right at its time
            runTest(location: loc, testType: "scheduled")
        }
    }

    func runTest(location: CLLocation?, testType: String? = nil) {
        guard !isTesting, !isJsTestActive else { return }
        isTesting = true
        lastTestTime = Date()
        
        var bgTask: UIBackgroundTaskIdentifier = .invalid
        bgTask = UIApplication.shared.beginBackgroundTask {
            UIApplication.shared.endBackgroundTask(bgTask)
            bgTask = .invalid
        }
        
        Task {
            await performSpeedTestAndUpload(location: location, testType: testType)
            if bgTask != .invalid {
                UIApplication.shared.endBackgroundTask(bgTask)
                bgTask = .invalid
            }
            self.isTesting = false
        }
    }
    
    /// Operator / ISP from the connection's public IP. Same source and names as the JS tester.
    private func resolvePublicISP(session: URLSession) async -> String? {
        guard let url = URL(string: "https://ipwho.is/?fields=connection,success") else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 3
        guard let (data, _) = try? await session.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              json["success"] as? Bool == true,
              let connection = json["connection"] as? [String: Any],
              let raw = (connection["isp"] as? String) ?? (connection["org"] as? String),
              !raw.isEmpty else { return nil }
        let lower = raw.lowercased()
        if lower.contains("jio") { return "Jio" }
        if lower.contains("airtel") { return "Airtel" }
        if lower.contains("bsnl") || lower.contains("bharat sanchar") { return "BSNL" }
        if lower.contains("vodafone") || lower.contains("idea") || lower.contains("vi ") { return "Vi" }
        if lower.contains("atria") || lower.contains("act fibernet") { return "ACT Fibernet" }
        if lower.contains("tata") { return "Tata Play Fiber" }
        if lower.contains("hathway") { return "Hathway" }
        if lower.contains("excitel") { return "Excitel" }
        return String(raw.prefix(20))
    }

    /// Every measured value stays nil (null on the server) when it could not be measured.
    private func performSpeedTestAndUpload(location: CLLocation?, testType: String? = nil) async {
        guard let serverUrl = URL(string: serverUrlString) else { return }
        let session = URLSession(configuration: .ephemeral)

        // 1. Network, telecom & radio context
        let path = pathMonitor.currentPath
        let network: String
        if path.status != .satisfied {
            network = "none"
        } else if path.usesInterfaceType(.wifi) {
            network = "wifi"
        } else if path.usesInterfaceType(.cellular) {
            network = "cellular"
        } else if path.usesInterfaceType(.wiredEthernet) {
            network = "ethernet"
        } else {
            network = "other"
        }

        var carrierName: String?
        var radioTech: String?
        if network == "wifi" {
            radioTech = "Wi-Fi"
        } else if network == "cellular" {
            let telephony = CTTelephonyNetworkInfo()
            if #available(iOS 12.0, *) {
                if let providers = telephony.serviceSubscriberCellularProviders {
                    carrierName = providers.values.compactMap { $0.carrierName }.first { !$0.isEmpty && $0 != "--" }
                }
                if let raw = telephony.serviceCurrentRadioAccessTechnology?.values.first {
                    if raw == CTRadioAccessTechnologyNR || raw == CTRadioAccessTechnologyNRNSA {
                        radioTech = "5G"
                    } else if raw == CTRadioAccessTechnologyLTE {
                        radioTech = "4G / LTE"
                    } else {
                        radioTech = raw.replacingOccurrences(of: "CTRadioAccessTechnology", with: "")
                    }
                }
            }
        }
        if carrierName == nil && network != "none" {
            carrierName = await resolvePublicISP(session: session)
        }

        // 2. Measure Latency: a warm-up request opens the connection (not counted), then 10 pings
        let pingCount = 10
        var pings: [Double] = []
        for i in -1..<pingCount {
            let pingUrl = serverUrl.appendingPathComponent("ping")
            var comps = URLComponents(url: pingUrl, resolvingAgainstBaseURL: false)
            comps?.queryItems = [URLQueryItem(name: "_t", value: "\(Date().timeIntervalSince1970)_\(i)")]

            if let target = comps?.url {
                let s = Date()
                if let (_, resp) = try? await session.data(from: target),
                   (resp as? HTTPURLResponse)?.statusCode == 200, i >= 0 {
                    pings.append(Date().timeIntervalSince(s) * 1000)
                }
            }
        }

        let latency: Double? = pings.isEmpty ? nil : {
            let sorted = pings.sorted()
            let mid = sorted.count / 2
            return sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
        }()
        var jitter: Double?
        if pings.count > 1 {
            var diff = 0.0
            for i in 1..<pings.count {
                diff += abs(pings[i] - pings[i-1])
            }
            jitter = diff / Double(pings.count - 1)
        }
        let packetLoss = (Double(pingCount - pings.count) / Double(pingCount) * 100).rounded()

        // 3. Measure Download and 4. Upload: 4 connections for 8 s each, steady-state speed
        let downMbps = await ThroughputMeter(isUpload: false, baseUrl: serverUrl).run()
        let upMbps = await ThroughputMeter(isUpload: true, baseUrl: serverUrl).run()

        // 5. Build Sample & Upload to server
        func rounded(_ value: Double?, _ places: Double) -> Any {
            guard let value = value else { return NSNull() }
            let factor = pow(10.0, places)
            return (value * factor).rounded() / factor
        }

        let sampleId = UUID().uuidString
        let deviceId = configuredDeviceId
        var samplePayload: [String: Any] = [
            "id": sampleId,
            "device_id": deviceId,
            "ts": Date().timeIntervalSince1970,
            "down_mbps": rounded(downMbps, 2),
            "up_mbps": rounded(upMbps, 2),
            "latency_ms": rounded(latency, 0),
            "jitter_ms": rounded(jitter, 1),
            "packet_loss_pct": packetLoss,
            "network": network,
            "radio": radioTech ?? NSNull(),
            "carrier": carrierName ?? NSNull(),
            "device_model": "Apple iPhone (Native iOS Background)",
            "os_platform": "iOS \(UIDevice.current.systemVersion)",
            "lat": location?.coordinate.latitude ?? NSNull(),
            "lng": location?.coordinate.longitude ?? NSNull(),
            "accuracy": location?.horizontalAccuracy ?? NSNull()
        ]
        if let testType = testType {
            samplePayload["test_type"] = testType
        }

        // Send POST to /v1/speed-samples
        let ingestUrl = serverUrl.appendingPathComponent("v1/speed-samples")
        var ingestReq = URLRequest(url: ingestUrl)
        ingestReq.httpMethod = "POST"
        ingestReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body = try? JSONSerialization.data(withJSONObject: ["samples": [samplePayload]]) {
            ingestReq.httpBody = body
            let response = try? await session.data(for: ingestReq)
            let uploaded = (response?.1 as? HTTPURLResponse)?.statusCode == 200
            NSLog("[NativeMonitorService] Background sample \(sampleId) uploaded=\(uploaded) (Device: \(deviceId))")

            // Any native test uploaded during a due schedule period also satisfies that period
            if uploaded, let period = dueSchedulePeriod() {
                markScheduledRun(period: period, at: Date().timeIntervalSince1970)
            }
        }
    }
}

/// Timed, multi-connection throughput test: the same method and numbers as
/// src/services/throughput.ts. Several parallel transfers for a fixed time, with the
/// connection start-up period left out; upload counts only bytes the server has confirmed.
final class ThroughputMeter: NSObject, URLSessionDataDelegate {
    private static let duration: TimeInterval = 8
    private static let connections = 4
    private static let rampUpFraction = 0.3
    private static let downloadCapBytes = 100 * 1024 * 1024
    private static let uploadCapBytes = 50 * 1024 * 1024
    private static let downloadRequestMB = 20
    private static let uploadChunkMinBytes = 64 * 1024
    private static let uploadChunkMaxBytes = 8 * 1024 * 1024
    private static let uploadChunkTargetSeconds = 0.5

    private let isUpload: Bool
    private let baseUrl: URL
    private let queue = OperationQueue()
    private var session: URLSession?
    private var start = Date()
    private var total = 0
    private var points: [(t: Double, bytes: Double)] = []
    private var openConnections = ThroughputMeter.connections
    private var slotOf: [Int: Int] = [:]
    private var bytesOf: [Int: Int] = [:] // download: bytes received; upload: chunk size
    private var startOf: [Int: Date] = [:]
    private var uploadBodies: [Int: Data] = [:]
    private var done = false
    private var continuation: CheckedContinuation<Double?, Never>?

    init(isUpload: Bool, baseUrl: URL) {
        self.isUpload = isUpload
        self.baseUrl = baseUrl
        super.init()
        queue.maxConcurrentOperationCount = 1
    }

    /// Steady-state speed in Mbps, or nil when nothing was transferred.
    func run() async -> Double? {
        await withCheckedContinuation { cont in
            queue.addOperation {
                self.continuation = cont
                self.session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: self.queue)
                self.start = Date()
                for slot in 0..<ThroughputMeter.connections {
                    self.startRequest(slot: slot, uploadBytes: ThroughputMeter.uploadChunkMinBytes)
                }
                DispatchQueue.global().asyncAfter(deadline: .now() + ThroughputMeter.duration) {
                    self.queue.addOperation { self.finish() }
                }
            }
        }
    }

    private func startRequest(slot: Int, uploadBytes: Int) {
        guard !done, let session = session else { return }
        let stamp = "\(Date().timeIntervalSince1970)_\(slot)"
        let task: URLSessionTask
        if isUpload {
            var comps = URLComponents(url: baseUrl.appendingPathComponent("upload"), resolvingAgainstBaseURL: false)
            comps?.queryItems = [URLQueryItem(name: "_t", value: stamp)]
            guard let url = comps?.url else { return }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
            let body = uploadBodies[uploadBytes] ?? Data(count: uploadBytes)
            uploadBodies[uploadBytes] = body
            task = session.uploadTask(with: req, from: body)
            bytesOf[task.taskIdentifier] = uploadBytes
        } else {
            var comps = URLComponents(url: baseUrl.appendingPathComponent("download"), resolvingAgainstBaseURL: false)
            comps?.queryItems = [
                URLQueryItem(name: "mb", value: String(ThroughputMeter.downloadRequestMB)),
                URLQueryItem(name: "_t", value: stamp),
            ]
            guard let url = comps?.url else { return }
            var req = URLRequest(url: url)
            req.setValue("no-cache, no-store", forHTTPHeaderField: "Cache-Control")
            task = session.dataTask(with: req)
            bytesOf[task.taskIdentifier] = 0
        }
        slotOf[task.taskIdentifier] = slot
        startOf[task.taskIdentifier] = Date()
        task.resume()
    }

    private func record(_ delta: Int) {
        guard !done, delta > 0 else { return }
        total += delta
        points.append((t: Date().timeIntervalSince(start) * 1000, bytes: Double(total)))
        if total >= (isUpload ? ThroughputMeter.uploadCapBytes : ThroughputMeter.downloadCapBytes) {
            finish()
        }
    }

    // A connection that fails stops; the test ends early only when all of them have
    private func connectionEnded() {
        openConnections -= 1
        if openConnections == 0 { finish() }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        // An upload task also receives the server's short reply; only download bytes count here
        guard !isUpload, !done else { return }
        bytesOf[dataTask.taskIdentifier, default: 0] += data.count
        record(data.count)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let id = task.taskIdentifier
        guard !done, let slot = slotOf.removeValue(forKey: id) else { return }
        let bytes = bytesOf.removeValue(forKey: id) ?? 0
        let started = startOf.removeValue(forKey: id) ?? Date()
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        guard error == nil, (200..<300).contains(status), bytes > 0 else {
            connectionEnded()
            return
        }
        if isUpload {
            record(bytes) // the server's reply confirms it received the whole chunk
            let quick = Date().timeIntervalSince(started) < ThroughputMeter.uploadChunkTargetSeconds
            startRequest(slot: slot, uploadBytes: quick ? min(bytes * 2, ThroughputMeter.uploadChunkMaxBytes) : bytes)
        } else {
            startRequest(slot: slot, uploadBytes: 0)
        }
    }

    private func finish() {
        guard !done else { return }
        done = true
        session?.invalidateAndCancel()
        session = nil
        continuation?.resume(returning: ThroughputMeter.steadyStateMbps(points))
        continuation = nil
    }

    /// Bytes moved by time t, interpolated between progress points (0 bytes at t = 0).
    private static func bytesAt(_ points: [(t: Double, bytes: Double)], _ t: Double) -> Double {
        var prev = (t: 0.0, bytes: 0.0)
        for p in points {
            if p.t >= t {
                let span = p.t - prev.t
                return span > 0 ? prev.bytes + (p.bytes - prev.bytes) * (t - prev.t) / span : p.bytes
            }
            prev = p
        }
        return prev.bytes
    }

    /// Bytes moved after the ramp-up period ÷ the time they took, in Mbps.
    static func steadyStateMbps(_ points: [(t: Double, bytes: Double)]) -> Double? {
        guard let end = points.last, end.bytes > 0, end.t > 0 else { return nil }
        let from = end.t * rampUpFraction
        let bytes = end.bytes - bytesAt(points, from)
        return bytes * 8 / 1_000_000 / ((end.t - from) / 1000)
    }
}

/// Low-power location session that keeps the JS runtime alive in the background
/// (screen off / app backgrounded) while any test or schedule needs it.
/// Separate from NativeMonitorService's manager, so it never triggers native monitor tests.
final class NativeKeepAlive: NSObject, CLLocationManagerDelegate {
    static let shared = NativeKeepAlive()

    private let lm = CLLocationManager()
    private var holders = Set<String>()
    private var relaunchHolders = Set<String>()
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    private override init() {
        super.init()
        lm.delegate = self
        lm.desiredAccuracy = kCLLocationAccuracyHundredMeters
        lm.distanceFilter = kCLDistanceFilterNone // Keep updates coming while stationary, like the monitor
        lm.pausesLocationUpdatesAutomatically = false
        lm.allowsBackgroundLocationUpdates = true
        if #available(iOS 11.0, *) {
            lm.showsBackgroundLocationIndicator = true
        }
    }

    func acquire(_ tag: String, relaunchAfterKill: Bool) {
        holders.insert(tag)
        if holders.count == 1 {
            lm.requestAlwaysAuthorization()
            lm.startUpdatingLocation()
            beginBackgroundTask()
        }
        if relaunchAfterKill {
            relaunchHolders.insert(tag)
            lm.startMonitoringSignificantLocationChanges() // Relaunches app from killed state
        }
    }

    func release(_ tag: String) {
        holders.remove(tag)
        relaunchHolders.remove(tag)
        if holders.isEmpty {
            lm.stopUpdatingLocation()
            endBackgroundTask()
        }
        if relaunchHolders.isEmpty {
            lm.stopMonitoringSignificantLocationChanges()
        }
    }

    // Short grace period so a single test can still finish if location permission was denied
    private func beginBackgroundTask() {
        guard backgroundTask == .invalid else { return }
        backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {}

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}

/// Location permission prompts. iOS only offers "Always" as a second prompt, after
/// "While Using" was granted, and shows that second prompt once.
final class NativeLocationPermission: NSObject, CLLocationManagerDelegate {
    static let shared = NativeLocationPermission()

    private let lm = CLLocationManager()
    private var completion: ((String) -> Void)?
    private var promptVisible = false
    private var statusBeforeRequest = ""

    private override init() {
        super.init()
        lm.delegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(appWillResignActive),
                                               name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appDidBecomeActive),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    func status() -> String {
        let current: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            current = lm.authorizationStatus
        } else {
            current = CLLocationManager.authorizationStatus()
        }
        switch current {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .notDetermined: return "notDetermined"
        default: return "denied"
        }
    }

    func request(always: Bool, completion: @escaping (String) -> Void) {
        finish() // Never leave an earlier request's promise waiting
        self.completion = completion
        promptVisible = false
        statusBeforeRequest = status()

        if always {
            lm.requestAlwaysAuthorization()
        } else {
            lm.requestWhenInUseAuthorization()
        }

        // iOS shows nothing if the one-time prompt was already used
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self = self, !self.promptVisible else { return }
            self.finish()
        }
    }

    private func finish() {
        let done = completion
        completion = nil
        done?(status())
    }

    @objc private func appWillResignActive() {
        if completion != nil { promptVisible = true }
    }

    // The prompt was closed. Choosing "Keep Only While Using" changes no status, so this is the only signal.
    @objc private func appDidBecomeActive() {
        if promptVisible { finish() }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if completion != nil && status() != statusBeforeRequest { finish() }
    }
}

@objc(NativeMonitorBridge)
final class NativeMonitorBridge: NSObject, RCTBridgeModule {
    static func moduleName() -> String! {
        return "NativeMonitorBridge"
    }
    
    static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    @objc(start:interval:resolver:rejecter:)
    func start(serverUrl: String, interval: Double, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeMonitorService.shared.configure(serverUrl: serverUrl, interval: interval)
            NativeMonitorService.shared.startMonitoring()
            resolve(true)
        }
    }
    
    @objc(startWithConfig:interval:deviceId:resolver:rejecter:)
    func startWithConfig(serverUrl: String, interval: Double, deviceId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeMonitorService.shared.configure(serverUrl: serverUrl, interval: interval, deviceId: deviceId)
            NativeMonitorService.shared.startMonitoring()
            resolve(true)
        }
    }
    
    @objc(getDeviceId:rejecter:)
    func getDeviceId(resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            resolve(NativeMonitorService.shared.getDeviceId())
        }
    }
    
    @objc(stop:rejecter:)
    func stop(resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeMonitorService.shared.stopMonitoring()
            resolve(true)
        }
    }
    
    @objc(isRunning:rejecter:)
    func isRunning(resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            resolve(NativeMonitorService.shared.isRunning())
        }
    }

    @objc(getLocationAccess:rejecter:)
    func getLocationAccess(resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            resolve(NativeLocationPermission.shared.status())
        }
    }

    @objc(requestLocationAccess:resolver:rejecter:)
    func requestLocationAccess(always: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeLocationPermission.shared.request(always: always) { resolve($0) }
        }
    }

    @objc(setJsTestLease:resolver:rejecter:)
    func setJsTestLease(seconds: Double, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeMonitorService.shared.setJsTestLease(seconds: seconds)
            resolve(true)
        }
    }

    @objc(acquireKeepAlive:relaunchAfterKill:resolver:rejecter:)
    func acquireKeepAlive(tag: String, relaunchAfterKill: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeKeepAlive.shared.acquire(tag, relaunchAfterKill: relaunchAfterKill)
            resolve(true)
        }
    }

    @objc(releaseKeepAlive:resolver:rejecter:)
    func releaseKeepAlive(tag: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeKeepAlive.shared.release(tag)
            resolve(true)
        }
    }

    @objc(setSchedule:fromTs:toTs:hour:minute:weekday:monthDay:serverUrl:deviceId:resolver:rejecter:)
    func setSchedule(frequency: String, fromTs: Double, toTs: Double, hour: Double, minute: Double, weekday: Double, monthDay: Double, serverUrl: String, deviceId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeMonitorService.shared.setSchedule(frequency: frequency, fromTs: fromTs, toTs: toTs,
                                                    hour: Int(hour), minute: Int(minute), weekday: Int(weekday), monthDay: Int(monthDay),
                                                    serverUrl: serverUrl, deviceId: deviceId)
            resolve(true)
        }
    }

    @objc(clearSchedule:rejecter:)
    func clearSchedule(resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeMonitorService.shared.clearSchedule()
            resolve(true)
        }
    }

    @objc(markScheduledRun:at:resolver:rejecter:)
    func markScheduledRun(period: Double, at: Double, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeMonitorService.shared.markScheduledRun(period: Int(period), at: at)
            resolve(true)
        }
    }

    @objc(getScheduleState:rejecter:)
    func getScheduleState(resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            resolve(NativeMonitorService.shared.scheduleState())
        }
    }
}
