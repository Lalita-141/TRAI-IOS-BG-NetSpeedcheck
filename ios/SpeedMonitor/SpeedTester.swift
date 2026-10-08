import Foundation
import Network
import CoreTelephony

struct SpeedResult { var down: Double?; var up: Double?; var latency: Double? }

final class SpeedTester {
    private lazy var session = URLSession(configuration: {
        let c = URLSessionConfiguration.ephemeral
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.timeoutIntervalForRequest = 30
        return c
    }())

    func run() async -> SpeedResult {
        var r = SpeedResult()
        r.latency = await latency()
        r.down = await download()
        r.up = await upload()
        return r
    }

    /// Median of 3 round trips to /ping
    private func latency() async -> Double? {
        var t: [Double] = []
        for _ in 0..<3 {
            let s = Date()
            if (try? await session.data(from: Config.server.appendingPathComponent("ping"))) != nil {
                t.append(Date().timeIntervalSince(s) * 1000)
            }
        }
        return t.sorted().dropFirst(t.count / 2).first
    }

    private func download() async -> Double? {
        var comps = URLComponents(url: Config.server.appendingPathComponent("download"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "mb", value: "\(Config.downloadMB)")]
        let s = Date()
        guard let (data, _) = try? await session.data(from: comps.url!) else { return nil }
        return mbps(bytes: data.count, since: s)
    }

    private func upload() async -> Double? {
        var req = URLRequest(url: Config.server.appendingPathComponent("upload"))
        req.httpMethod = "POST"
        let body = Data(count: Config.uploadMB * 1024 * 1024)
        let s = Date()
        guard (try? await session.upload(for: req, from: body)) != nil else { return nil }
        return mbps(bytes: body.count, since: s)
    }

    private func mbps(bytes: Int, since: Date) -> Double {
        Double(bytes) * 8 / 1_000_000 / max(Date().timeIntervalSince(since), 0.001)
    }

    // MARK: network context
    static func currentNetwork() async -> (type: String, constrained: Bool) {
        await withCheckedContinuation { cont in
            let m = NWPathMonitor()
            var done = false
            m.pathUpdateHandler = { p in
                if done { return }
                done = true
                let t = p.usesInterfaceType(.wifi) ? "wifi" : p.usesInterfaceType(.cellular) ? "cellular"
                    : p.usesInterfaceType(.wiredEthernet) ? "ethernet" : p.status == .satisfied ? "other" : "none"
                m.cancel()
                cont.resume(returning: (t, p.isConstrained || p.isExpensive))
            }
            m.start(queue: .global())
        }
    }

    static func radioTech() -> String? {
        let raw = CTTelephonyNetworkInfo().serviceCurrentRadioAccessTechnology?.values.first
        switch raw {
        case CTRadioAccessTechnologyNR, CTRadioAccessTechnologyNRNSA: return "5G"
        case CTRadioAccessTechnologyLTE: return "LTE"
        case .some(let v): return v.replacingOccurrences(of: "CTRadioAccessTechnology", with: "")
        case .none: return nil
        }
    }
}
