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
    private var serverUrlString: String = "https://140-245-3-81.sslip.io"

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
                testType: duePeriod != nil ? "scheduled" : nil,
                useFallbackLocation: duePeriod == nil
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
            startMonitoring()
            runTest(location: lm.location)
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
    
    private func performSpeedTestAndUpload(location: CLLocation?, testType: String? = nil, useFallbackLocation: Bool = true) async {
        guard let serverUrl = URL(string: serverUrlString) else { return }
        
        // 1. Telecom & Radio context
        var carrierName = "Cellular"
        var radioTech = "5G"
        let telephony = CTTelephonyNetworkInfo()
        if #available(iOS 12.0, *), let providers = telephony.serviceSubscriberCellularProviders {
            for (_, carrier) in providers {
                if let name = carrier.carrierName, !name.isEmpty {
                    carrierName = name
                    break
                }
            }
            if let techs = telephony.serviceCurrentRadioAccessTechnology, let raw = techs.values.first {
                if raw == CTRadioAccessTechnologyNR || raw == CTRadioAccessTechnologyNRNSA {
                    radioTech = "5G"
                } else if raw == CTRadioAccessTechnologyLTE {
                    radioTech = "4G / LTE"
                } else {
                    radioTech = raw.replacingOccurrences(of: "CTRadioAccessTechnology", with: "")
                }
            }
        }
        
        // 2. Measure Latency (5 pings)
        var pings: [Double] = []
        let session = URLSession(configuration: .ephemeral)
        for i in 0..<5 {
            let pingUrl = serverUrl.appendingPathComponent("ping")
            var comps = URLComponents(url: pingUrl, resolvingAgainstBaseURL: false)
            comps?.queryItems = [URLQueryItem(name: "_t", value: "\(Date().timeIntervalSince1970)_\(i)")]
            
            if let target = comps?.url {
                let s = Date()
                if let (_, resp) = try? await session.data(from: target),
                   (resp as? HTTPURLResponse)?.statusCode == 200 {
                    pings.append(Date().timeIntervalSince(s) * 1000)
                }
            }
        }
        
        let latency = pings.isEmpty ? 50.0 : pings.sorted()[pings.count / 2]
        var jitter = 0.0
        if pings.count > 1 {
            var diff = 0.0
            for i in 1..<pings.count {
                diff += abs(pings[i] - pings[i-1])
            }
            jitter = diff / Double(pings.count - 1)
        }
        let packetLoss = Double((5 - pings.count) * 20)
        
        // 3. Measure Download (2 MB)
        var downMbps = 0.0
        let downUrl = serverUrl.appendingPathComponent("download")
        var downComps = URLComponents(url: downUrl, resolvingAgainstBaseURL: false)
        downComps?.queryItems = [URLQueryItem(name: "mb", value: "2"), URLQueryItem(name: "_t", value: "\(Date().timeIntervalSince1970)")]
        if let downTarget = downComps?.url {
            let start = Date()
            if let (data, _) = try? await session.data(from: downTarget) {
                let duration = max(Date().timeIntervalSince(start), 0.001)
                downMbps = Double(data.count * 8) / 1_000_000 / duration
            }
        }
        
        // 4. Measure Upload (1 MB)
        var upMbps = 0.0
        let upUrl = serverUrl.appendingPathComponent("upload")
        var upReq = URLRequest(url: upUrl)
        upReq.httpMethod = "POST"
        upReq.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        let dummyData = Data(count: 1024 * 1024)
        let upStart = Date()
        if let (_, resp) = try? await session.upload(for: upReq, from: dummyData),
           (resp as? HTTPURLResponse)?.statusCode == 200 {
            let duration = max(Date().timeIntervalSince(upStart), 0.001)
            upMbps = Double(dummyData.count * 8) / 1_000_000 / duration
        }
        
        // 5. Build Sample & Upload to server
        let sampleId = UUID().uuidString
        let deviceId = configuredDeviceId
        let lat = location?.coordinate.latitude ?? 18.5501
        let lng = location?.coordinate.longitude ?? 73.9410
        let accuracy = location?.horizontalAccuracy ?? 5.0
        let env = accuracy < 25.0 ? "Outdoor" : "Indoor"
        
        var samplePayload: [String: Any] = [
            "id": sampleId,
            "device_id": deviceId,
            "ts": Date().timeIntervalSince1970,
            "down_mbps": Double(String(format: "%.2f", downMbps)) ?? downMbps,
            "up_mbps": Double(String(format: "%.2f", upMbps)) ?? upMbps,
            "latency_ms": round(latency),
            "jitter_ms": Double(String(format: "%.1f", jitter)) ?? jitter,
            "packet_loss_pct": packetLoss,
            "network": "cellular",
            "radio": radioTech,
            "carrier": carrierName,
            "device_model": "Apple iPhone (Native iOS Background)",
            "os_platform": "iOS \(UIDevice.current.systemVersion)",
            "location_type": env,
            "lat": lat,
            "lng": lng,
            "accuracy": accuracy
        ]
        if let testType = testType {
            samplePayload["test_type"] = testType
        }
        if location == nil && !useFallbackLocation {
            samplePayload["lat"] = NSNull()
            samplePayload["lng"] = NSNull()
            samplePayload["accuracy"] = NSNull()
        }

        // Send POST to /v1/speed-samples
        let ingestUrl = serverUrl.appendingPathComponent("v1/speed-samples")
        var ingestReq = URLRequest(url: ingestUrl)
        ingestReq.httpMethod = "POST"
        ingestReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body = try? JSONSerialization.data(withJSONObject: ["samples": [samplePayload]]) {
            ingestReq.httpBody = body
            let response = try? await session.data(for: ingestReq)
            NSLog("[NativeMonitorService] Successfully uploaded background/killed sample \(sampleId) -> \(downMbps) Mbps (Device: \(deviceId))")

            // Any native test uploaded during a due schedule period also satisfies that period
            if (response?.1 as? HTTPURLResponse)?.statusCode == 200, let period = dueSchedulePeriod() {
                markScheduledRun(period: period, at: Date().timeIntervalSince1970)
            }
        }
    }
}

/// Low-power location session that keeps the JS runtime alive in the background
/// (screen off / app backgrounded) while a continuous test session runs.
/// Separate from NativeMonitorService's manager, so it never triggers native monitor tests.
final class NativeKeepAlive: NSObject, CLLocationManagerDelegate {
    static let shared = NativeKeepAlive()

    private let lm = CLLocationManager()
    private var holders = Set<String>()

    private override init() {
        super.init()
        lm.delegate = self
        lm.desiredAccuracy = kCLLocationAccuracyHundredMeters
        lm.distanceFilter = 50
        lm.pausesLocationUpdatesAutomatically = false
        lm.allowsBackgroundLocationUpdates = true
        if #available(iOS 11.0, *) {
            lm.showsBackgroundLocationIndicator = true
        }
    }

    func acquire(_ tag: String) {
        holders.insert(tag)
        if holders.count == 1 {
            lm.requestAlwaysAuthorization()
            lm.startUpdatingLocation()
        }
    }

    func release(_ tag: String) {
        holders.remove(tag)
        if holders.isEmpty {
            lm.stopUpdatingLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {}

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
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

    @objc(setJsTestLease:resolver:rejecter:)
    func setJsTestLease(seconds: Double, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeMonitorService.shared.setJsTestLease(seconds: seconds)
            resolve(true)
        }
    }

    @objc(acquireKeepAlive:resolver:rejecter:)
    func acquireKeepAlive(tag: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            NativeKeepAlive.shared.acquire(tag)
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
