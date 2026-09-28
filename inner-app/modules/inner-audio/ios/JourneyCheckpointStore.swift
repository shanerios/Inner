import Foundation

/// Bounded, atomic diagnostic journal. No audio callback performs disk I/O.
final class JourneyCheckpointStore {
  private let url: URL
  private let lock = NSLock()
  private var acknowledged: [String] = []
  private let limit = 60

  init(url: URL) { self.url = url }

  private func records() throws -> [[String: Any]] {
    guard FileManager.default.fileExists(atPath: url.path) else { return [] }
    let data = try Data(contentsOf: url)
    guard let records = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      throw CocoaError(.fileReadCorruptFile)
    }
    return records
  }

  func read() throws -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    return try records()
  }

  func save(_ record: [String: Any]) throws {
    lock.lock(); defer { lock.unlock() }
    guard let id = record["sessionId"] as? String, !acknowledged.contains(id) else { return }
    let previous = try records()
    if previous.contains(where: { $0["sessionId"] as? String == id && $0["terminalOutcome"] != nil }) { return }
    let next = previous.filter { $0["sessionId"] as? String != id } + [record]
    try write(Array(next.suffix(limit)))
  }

  func acknowledge(_ sessionId: String?) throws {
    lock.lock(); defer { lock.unlock() }
    let previous = try records()
    let ids = sessionId.map { [$0] } ?? previous.compactMap { $0["sessionId"] as? String }
    try write(previous.filter { !ids.contains($0["sessionId"] as? String ?? "") })
    acknowledged = Array((acknowledged + ids).suffix(limit))
  }

  private func write(_ records: [[String: Any]]) throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard JSONSerialization.isValidJSONObject(records) else { throw CocoaError(.propertyListWriteInvalid) }
    let data = try JSONSerialization.data(withJSONObject: records, options: [.sortedKeys])
    try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
}
