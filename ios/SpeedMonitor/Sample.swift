import Foundation

struct Sample: Codable, Identifiable {
    var id = UUID().uuidString
    var device_id = Config.deviceID
    var ts = Date().timeIntervalSince1970
    var down_mbps: Double?
    var up_mbps: Double?
    var latency_ms: Double?
    var network: String?
    var radio: String?
    var lat: Double?
    var lng: Double?
    var accuracy: Double?
}

/// Simple file-backed queue: samples persist until the server acknowledges them.
final class SampleStore {
    static let shared = SampleStore()
    private let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("pending.json")
    private let q = DispatchQueue(label: "samplestore")
    private var items: [Sample] = []

    init() {
        if let d = try? Data(contentsOf: url), let s = try? JSONDecoder().decode([Sample].self, from: d) { items = s }
    }

    func add(_ s: Sample) { q.sync { items.append(s); save() } }
    func pending(_ n: Int) -> [Sample] { q.sync { Array(items.prefix(n)) } }
    var count: Int { q.sync { items.count } }
    func remove(ids: Set<String>) { q.sync { items.removeAll { ids.contains($0.id) }; save() } }
    private func save() { try? JSONEncoder().encode(items).write(to: url, options: .atomic) }
}
