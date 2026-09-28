import Foundation

/// Host executable tests of the exact production persistence implementation.
@main struct JourneyCheckpointStoreTests {
  static func main() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let url = root.appendingPathComponent("journal.json")
    let store = JourneyCheckpointStore(url: url)
    func record(_ id: String, _ outcome: String? = nil) -> [String: Any] {
      var value: [String: Any] = ["sessionId": id, "positionMs": 1000]
      if let outcome { value["terminalOutcome"] = outcome }
      return value
    }
    try store.save(record("old", "completed"))
    try store.save(record("new"))
    // A new store models a new process reading the same atomic file.
    let relaunched = JourneyCheckpointStore(url: url)
    let loaded = try relaunched.read()
    precondition(loaded.count == 2 && loaded[0]["terminalOutcome"] as? String == "completed")
    try store.save(record("old"))
    precondition(tryRead(store)[0]["terminalOutcome"] as? String == "completed")
    try store.acknowledge("old")
    try store.save(record("old")) // an already captured heartbeat arriving after acknowledgement
    precondition(tryRead(store).map { $0["sessionId"] as! String } == ["new"])
    for i in 0..<80 { try store.save(record("session-\(i)")) }
    precondition(tryRead(store).count == 60)
    // An invalid JSON value fails serialization without damaging the previous file.
    do { try store.save(["sessionId": "bad", "positionMs": Double.nan]); preconditionFailure("write should fail") }
    catch { precondition(tryRead(store).count == 60) }
    // Corruption is surfaced, not treated as an empty journal then overwritten.
    try Data("broken".utf8).write(to: url)
    do { _ = try store.read(); preconditionFailure("corruption should fail") } catch {}
    print("JourneyCheckpointStore: relaunch, terminal retention, scoped acknowledgement, late writes, bounds, failed writes and corruption PASS")
  }

  static func tryRead(_ store: JourneyCheckpointStore) -> [[String: Any]] { try! store.read() }
}
