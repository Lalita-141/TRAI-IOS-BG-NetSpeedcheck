import Foundation
import CoreLocation
import UIKit
import BackgroundTasks

/// Background location keeps the app running; each location callback checks whether a test is due.
final class MonitorService: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = MonitorService()
    private let lm = CLLocationManager()
    private let tester = SpeedTester()
    private var lastTest = Date.distantPast
    private var testing = false

    @Published var running = false
    @Published var last: Sample?
    @Published var pending = 0
    @Published var auth: CLAuthorizationStatus = .notDetermined

    override init() {
        super.init()
        lm.delegate = self
        lm.desiredAccuracy = kCLLocationAccuracyHundredMeters
        lm.distanceFilter = 50
        lm.pausesLocationUpdatesAutomatically = false
        lm.allowsBackgroundLocationUpdates = true
        lm.showsBackgroundLocationIndicator = true
        auth = lm.authorizationStatus
    }

    func start() {
        lm.requestAlwaysAuthorization()
        lm.startUpdatingLocation()
        lm.startMonitoringSignificantLocationChanges() // relaunches app after termination
        running = true
    }

    func stop() {
        lm.stopUpdatingLocation()
        lm.stopMonitoringSignificantLocationChanges()
        running = false
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) { auth = m.authorizationStatus }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        if Date().timeIntervalSince(lastTest) >= Config.testIntervalSeconds { runTest(at: loc) }
    }

    func testNow() { runTest(at: lm.location) }

    private func runTest(at loc: CLLocation?) {
        if testing { return }
        var bg = UIBackgroundTaskIdentifier.invalid
        bg = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(bg) }
        Task {
            await performTest(at: loc)
            UIApplication.shared.endBackgroundTask(bg)
        }
    }

    private func performTest(at loc: CLLocation?) async {
        if testing { return }
        testing = true
        lastTest = Date()
        defer { testing = false }
        let net = await SpeedTester.currentNetwork()
        if net.type == "none" || (Config.wifiOnly && net.type != "wifi") { return }
        let r = await tester.run()
        var s = Sample()
        s.down_mbps = r.down; s.up_mbps = r.up; s.latency_ms = r.latency
        s.network = net.type
        s.radio = net.type == "cellular" ? SpeedTester.radioTech() : nil
        s.lat = loc?.coordinate.latitude; s.lng = loc?.coordinate.longitude
        s.accuracy = loc?.horizontalAccuracy
        SampleStore.shared.add(s)
        await Uploader.shared.flush()
        await MainActor.run { self.last = s; self.pending = SampleStore.shared.count }
    }

    // MARK: BGAppRefreshTask fallback (iOS-scheduled, opportunistic)
    static let refreshID = "com.example.speedmonitor.refresh"

    static func scheduleRefresh() {
        let req = BGAppRefreshTaskRequest(identifier: refreshID)
        req.earliestBeginDate = Date(timeIntervalSinceNow: Config.testIntervalSeconds)
        try? BGTaskScheduler.shared.submit(req)
    }

    func handleRefresh(_ task: BGAppRefreshTask) {
        MonitorService.scheduleRefresh() // always queue the next one first
        let work = Task {
            if Date().timeIntervalSince(lastTest) >= Config.testIntervalSeconds {
                await performTest(at: lm.location)
            } else {
                await Uploader.shared.flush()
            }
            task.setTaskCompleted(success: !Task.isCancelled)
        }
        task.expirationHandler = { work.cancel() }
    }
}
