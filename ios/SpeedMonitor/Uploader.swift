import Foundation

/// Uploads queued samples in batches. Safe to call repeatedly; server dedupes by sample id.
final class Uploader {
    static let shared = Uploader()
    private var busy = false

    func flush() async {
        if busy { return }
        busy = true
        defer { busy = false }
        while true {
            let batch = SampleStore.shared.pending(Config.batchSize)
            if batch.isEmpty { return }
            var req = URLRequest(url: Config.server.appendingPathComponent("v1/speed-samples"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONEncoder().encode(["samples": batch])
            guard let (_, resp) = try? await URLSession.shared.data(for: req),
                  (resp as? HTTPURLResponse)?.statusCode == 200 else { return } // retry next time
            SampleStore.shared.remove(ids: Set(batch.map(\.id)))
        }
    }
}
