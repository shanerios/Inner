package expo.modules.inneraudio

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CheckpointJournalTest {
  private class Disk {
    var json: String? = null
    var writable = true
    fun journal() = CheckpointJournal({ json }, { value -> if (writable) { json = value; true } else false })
  }
  private fun record(id: String, outcome: String? = null) = JSONObject().apply {
    put("sessionId", id)
    put("positionMs", 1000)
    outcome?.let { put("terminalOutcome", it) }
  }

  @Test fun terminalEvidenceSurvivesRelaunchAndNewJourneys() {
    val disk = Disk()
    val journal = disk.journal()
    assertTrue(journal.save(record("old", "completed")))
    assertTrue(journal.save(record("new")))
    assertTrue(journal.save(record("old")))
    val reloaded = disk.journal().read()
    assertEquals(listOf("old", "new"), reloaded.map { it["sessionId"] })
    assertEquals("completed", reloaded[0]["terminalOutcome"])
  }

  @Test fun acknowledgementIsScopedAndSuppressesLateHeartbeats() {
    val journal = Disk().journal()
    journal.save(record("old"))
    journal.save(record("new"))
    assertTrue(journal.acknowledge("old"))
    journal.save(record("old"))
    assertEquals(listOf("new"), journal.read().map { it["sessionId"] })
  }

  @Test fun failedAcknowledgementRetainsEvidenceAndCanRetry() {
    val disk = Disk()
    val journal = disk.journal()
    journal.save(record("old", "user_stopped"))
    disk.writable = false
    assertFalse(journal.acknowledge("old"))
    assertEquals(1, journal.read().size)
    disk.writable = true
    assertTrue(journal.acknowledge("old"))
    assertTrue(journal.read().isEmpty())
  }

  @Test fun retentionIsBoundedAndCorruptionIsNotOverwritten() {
    val disk = Disk()
    val journal = disk.journal()
    repeat(80) { journal.save(record("session-$it")) }
    assertEquals(60, journal.read().size)
    assertEquals("session-20", journal.read()[0]["sessionId"])
    disk.json = "broken"
    try { journal.save(record("new")); fail("corruption must surface") } catch (_: org.json.JSONException) {}
    assertEquals("broken", disk.json)
  }
}
