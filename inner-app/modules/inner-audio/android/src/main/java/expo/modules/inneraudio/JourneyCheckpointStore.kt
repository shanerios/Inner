package expo.modules.inneraudio

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Android disk adapter; journal logic is also exercised directly on the JVM. */
internal object JourneyCheckpointStore {
  private var journal: CheckpointJournal? = null

  @Synchronized private fun journal(context: Context): CheckpointJournal {
    return journal ?: run {
      val prefs = context.applicationContext.getSharedPreferences("inner_audio_checkpoint", Context.MODE_PRIVATE)
      CheckpointJournal(
        readJson = {
          prefs.getString("checkpoint_journal_v2", null)
            ?: prefs.getString("checkpoint_json", null)?.let { JSONArray().put(JSONObject(it)).toString() }
        },
        writeJson = { json ->
          prefs.edit().putString("checkpoint_journal_v2", json).remove("checkpoint_json").commit()
        },
      ).also { journal = it }
    }
  }

  fun read(context: Context): List<Map<String, Any?>> = journal(context).read()
  fun save(context: Context, record: JSONObject): Boolean = journal(context).save(record)
  fun acknowledge(context: Context, sessionId: String?): Boolean = journal(context).acknowledge(sessionId)
}

/** Bounded diagnostic journal. Never called from the render thread. */
internal class CheckpointJournal(
  private val readJson: () -> String?,
  private val writeJson: (String) -> Boolean,
) {
  private val limit = 60
  private val acknowledged = linkedSetOf<String>()

  private fun records(): List<JSONObject> {
    val raw = readJson() ?: return emptyList()
    val array = JSONArray(raw)
    return List(array.length()) { array.getJSONObject(it) }
  }

  @Synchronized fun read(): List<Map<String, Any?>> = records().map(::asMap)

  @Synchronized fun save(record: JSONObject): Boolean {
    val id = record.getString("sessionId")
    if (id in acknowledged) return true
    val previous = records()
    if (previous.any { it.optString("sessionId") == id && it.has("terminalOutcome") }) return true
    return write((previous.filter { it.optString("sessionId") != id } + record).takeLast(limit))
  }

  @Synchronized fun acknowledge(sessionId: String?): Boolean {
    val previous = records()
    val ids = if (sessionId == null) previous.map { it.getString("sessionId") } else listOf(sessionId)
    val success = write(previous.filter { it.optString("sessionId") !in ids })
    if (success) {
      acknowledged.addAll(ids)
      while (acknowledged.size > limit) acknowledged.remove(acknowledged.first())
    }
    return success
  }

  private fun write(records: List<JSONObject>): Boolean = writeJson(JSONArray(records).toString())

  private fun convert(value: Any?): Any? = when (value) {
    JSONObject.NULL -> null
    is JSONObject -> asMap(value)
    is JSONArray -> List(value.length()) { convert(value.get(it)) }
    else -> value
  }

  private fun asMap(json: JSONObject): Map<String, Any?> =
    json.keys().asSequence().associateWith { convert(json.get(it)) }
}
