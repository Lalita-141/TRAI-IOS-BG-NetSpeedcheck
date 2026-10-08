import SwiftUI
import BackgroundTasks

@main
struct SpeedMonitorApp: App {
    @Environment(\.scenePhase) private var phase

    init() {
        // Must be registered before app launch finishes
        BGTaskScheduler.shared.register(forTaskWithIdentifier: MonitorService.refreshID, using: nil) { task in
            MonitorService.shared.handleRefresh(task as! BGAppRefreshTask)
        }
    }

    var body: some Scene {
        WindowGroup { ContentView() }
            .onChange(of: phase) { _, new in
                if new == .background, MonitorService.shared.running { MonitorService.scheduleRefresh() }
            }
    }
}

struct ContentView: View {
    @StateObject private var svc = MonitorService.shared

    var body: some View {
        NavigationView {
            List {
                Section("Status") {
                    Text(svc.running ? "Monitoring ON" : "Monitoring OFF")
                    Text("Location permission: \(svc.auth == .authorizedAlways ? "Always" : "\(svc.auth.rawValue) (needs Always)")")
                    Text("Pending uploads: \(svc.pending)")
                }
                if let s = svc.last {
                    Section("Last sample") {
                        Text(String(format: "Down %.1f Mbps", s.down_mbps ?? 0))
                        Text(String(format: "Up %.1f Mbps", s.up_mbps ?? 0))
                        Text(String(format: "Latency %.0f ms", s.latency_ms ?? 0))
                        Text("\(s.network ?? "-") \(s.radio ?? "")")
                        Text(String(format: "%.5f, %.5f", s.lat ?? 0, s.lng ?? 0))
                    }
                }
                Section {
                    Button(svc.running ? "Stop" : "Start") { svc.running ? svc.stop() : svc.start() }
                    Button("Test now") { svc.testNow() }
                }
            }
            .navigationTitle("Speed Monitor")
        }
    }
}
