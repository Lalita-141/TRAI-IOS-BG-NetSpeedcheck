import Foundation

enum Config {
    // Use your PC/Mac LAN IP for local testing (ATS exception needed for http, see README)
    static let server = URL(string: "http://192.168.1.10:8000")!
    static let testIntervalSeconds: TimeInterval = 300   // 5 min
    static let downloadMB = 2
    static let uploadMB = 1
    static let wifiOnly = false
    static let batchSize = 20

    static var deviceID: String {
        let k = "deviceID"
        if let v = UserDefaults.standard.string(forKey: k) { return v }
        let v = UUID().uuidString
        UserDefaults.standard.set(v, forKey: k)
        return v
    }
}
