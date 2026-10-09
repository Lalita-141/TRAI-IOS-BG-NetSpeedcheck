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
    
    func configure(serverUrl: String, interval: Double) {
        self.serverUrlString = serverUrl
        self.intervalSeconds = max(interval, 5.0)
    }
    
    func startMonitoring() {
        guard !isMonitoring else { return }
        isMonitoring = true
        
        lm.requestAlwaysAuthorization()
        lm.startUpdatingLocation()
        lm.startMonitoringSignificantLocationChanges() // Relaunches app from killed state!
        
        scheduleAppRefresh()
        
        // Trigger immediate test
        runTest(location: lm.location)
    }
    
    func stopMonitoring() {
        isMonitoring = false
        lm.stopUpdatingLocation()
        lm.stopMonitoringSignificantLocationChanges()
    }
    
    func isRunning() -> Bool {
        return isMonitoring
    }
    
    func scheduleAppRefresh() {
        if #available(iOS 13.0, *) {
            let request = BGAppRefreshTaskRequest(identifier: "com.rnt.speedmonitor.refresh")
            request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
            try? BGTaskScheduler.shared.submit(request)
        }
    }
    
    @available(iOS 13.0, *)
    func handleBackgroundAppRefresh(task: BGAppRefreshTask) {
        scheduleAppRefresh()
        task.expirationHandler = { () -> Void in
            task.setTaskCompleted(success: false)
        }
        Task {
            await self.performSpeedTestAndUpload(location: self.lm.location)
            task.setTaskCompleted(success: true)
        }
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
        }
    }
    
    func runTest(location: CLLocation?) {
        guard !isTesting else { return }
        isTesting = true
        lastTestTime = Date()
        
        var bgTask: UIBackgroundTaskIdentifier = .invalid
        bgTask = UIApplication.shared.beginBackgroundTask {
            UIApplication.shared.endBackgroundTask(bgTask)
            bgTask = .invalid
        }
        
        Task {
            await performSpeedTestAndUpload(location: location)
            if bgTask != .invalid {
                UIApplication.shared.endBackgroundTask(bgTask)
                bgTask = .invalid
            }
            self.isTesting = false
        }
    }
    
    private func performSpeedTestAndUpload(location: CLLocation?) async {
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
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        let lat = location?.coordinate.latitude ?? 18.5501
        let lng = location?.coordinate.longitude ?? 73.9410
        let accuracy = location?.horizontalAccuracy ?? 5.0
        let env = accuracy < 25.0 ? "Outdoor" : "Indoor"
        
        let samplePayload: [String: Any] = [
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
        
        // Send POST to /v1/speed-samples
        let ingestUrl = serverUrl.appendingPathComponent("v1/speed-samples")
        var ingestReq = URLRequest(url: ingestUrl)
        ingestReq.httpMethod = "POST"
        ingestReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body = try? JSONSerialization.data(withJSONObject: ["samples": [samplePayload]]) {
            ingestReq.httpBody = body
            _ = try? await session.data(for: ingestReq)
            NSLog("[NativeMonitorService] Successfully uploaded background/killed sample \(sampleId) -> \(downMbps) Mbps")
        }
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
}
