package expo.modules.inneraudio

import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.min

/**
 * Renders The Induction through the real Android engine, offline, exactly as the app plays it: the timeline is the
 * checked-in fixture written from core/audio/inductionJourney.ts (`node scripts/export-induction-fixture.js`), the
 * Bell is the real signal file at its real gain. It checks the render is finite, audible, not clipped, and that both
 * Bells fire. Set INDUCTION_WAV to a path and it also writes the render as a 16-bit stereo WAV to listen to.
 */
class InductionRenderTest {
  private val bufferFrames = 960

  @After fun cleanup() {
    ProceduralAudioEngine.wallClockMs = { System.currentTimeMillis() }
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    ProceduralAudioEngine.reset()
  }

  private fun fixture(): JSONObject {
    val stream = javaClass.classLoader!!.getResourceAsStream("induction-fixture.json")
    assertNotNull("induction-fixture.json is missing; run node scripts/export-induction-fixture.js", stream)
    return JSONObject(stream!!.bufferedReader().readText())
  }

  private fun configFrom(json: JSONObject): AudioConfigRecord = AudioConfigRecord().apply {
    carrierHz = json.getDouble("carrierHz")
    binauralCarrierHz = json.getDouble("binauralCarrierHz")
    binauralDeltaHz = json.getDouble("binauralDeltaHz")
    toneGain = json.getDouble("toneGain")
    harmonicWarmth = json.getDouble("harmonicWarmth")
    binauralGain = json.getDouble("binauralGain")
    noiseColor = if (json.isNull("noiseColor")) null else json.getString("noiseColor")
    noiseGain = json.getDouble("noiseGain")
    environment = json.getString("environment")
    environmentGain = json.getDouble("environmentGain")
    environmentIntensity = json.getDouble("environmentIntensity")
    thresholdShift = json.getDouble("thresholdShift")
    identityPresence = json.getDouble("identityPresence")
    identityDensity = json.getDouble("identityDensity")
    identityVariety = json.getDouble("identityVariety")
    noiseHighCutHz = json.getDouble("noiseHighCutHz")
    noiseWidth = json.getDouble("noiseWidth")
    noiseDriftDb = json.getDouble("noiseDriftDb")
    noiseDriftSeconds = json.getDouble("noiseDriftSeconds")
    binauralBreathDb = json.getDouble("binauralBreathDb")
    binauralBreathInSeconds = json.getDouble("binauralBreathInSeconds")
    binauralBreathOutSeconds = json.getDouble("binauralBreathOutSeconds")
    binauralBreathVariation = json.getDouble("binauralBreathVariation")
    harmonicTranslation = json.getDouble("harmonicTranslation")
    templeGain = json.getDouble("templeGain")
    templeIntensity = json.getDouble("templeIntensity")
    masterGain = json.getDouble("masterGain")
    rampMs = json.getDouble("rampMs")
    spatialMode = json.getString("spatialMode")
    spatialTarget = json.getString("spatialTarget")
    spatialDepth = json.getDouble("spatialDepth")
    spatialRate = json.getDouble("spatialRate")
  }

  private fun timelineFrom(fixture: JSONObject): AudioTimelineRecord = AudioTimelineRecord().apply {
    id = "the-induction"
    title = fixture.getString("title")
    seed = fixture.getDouble("seed")
    fadeInMs = fixture.getDouble("fadeInMs")
    totalDurationMs = fixture.getDouble("totalDurationMs")
    val stagesJson: JSONArray = fixture.getJSONArray("stages")
    stages = (0 until stagesJson.length()).map { i ->
      val stageJson = stagesJson.getJSONObject(i)
      TimelineStageRecord().apply {
        id = stageJson.getString("id")
        label = stageJson.getString("label")
        durationMs = stageJson.getDouble("durationMs")
        transitionMs = stageJson.getDouble("transitionMs")
        config = configFrom(stageJson.getJSONObject("config"))
        val eventsJson = stageJson.getJSONArray("spatialEvents")
        spatialEvents = (0 until eventsJson.length()).map { j ->
          val e = eventsJson.getJSONObject(j)
          SpatialEventRecord().apply {
            id = e.getString("id")
            atMs = e.getDouble("atMs")
            type = e.getString("type")
            direction = e.optString("direction", "right")
          }
        }
      }
    }
  }

  private fun bellUri(): String {
    var directory: File? = File("").absoluteFile
    while (directory != null) {
      val candidate = File(directory, "assets/sounds/signal_bell.wav")
      if (candidate.exists()) return candidate.toURI().toString()
      directory = directory.parentFile
    }
    fail("assets/sounds/signal_bell.wav not found above ${File("").absolutePath}")
    return ""
  }

  private fun wav(samples: FloatArray, sampleRate: Int): ByteArray {
    val data = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (sample in samples) data.putShort((min(1f, maxOf(-1f, sample)) * 32767f).toInt().toShort())
    val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray()).putInt(36 + data.capacity()).put("WAVE".toByteArray())
    header.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(2).putInt(sampleRate).putInt(sampleRate * 4).putShort(4).putShort(16)
    header.put("data".toByteArray()).putInt(data.capacity())
    return ByteArrayOutputStream().apply { write(header.array()); write(data.array()) }.toByteArray()
  }

  @Test fun theInductionRendersCleanlyAndBothBellsFire() {
    val fixture = fixture()
    val timeline = timelineFrom(fixture)
    val totalMs = fixture.getDouble("totalDurationMs")
    val bellGain = fixture.getDouble("bellGain")

    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    val sampleRate = ProceduralAudioEngine.sampleRate
    var cumulativeFrames = 0L
    ProceduralAudioEngine.wallClockMs = { (cumulativeFrames * 1_000.0 / sampleRate).toLong() }
    ProceduralAudioEngine.configure(configFrom(fixture.getJSONObject("initialConfig")))
    ProceduralAudioEngine.setTimeline(timeline)
    ProceduralAudioEngine.setRecognitionSignal("bell", bellUri(), bellGain)
    ProceduralAudioEngine.checkpointSessionId = "induction-render"
    ProceduralAudioEngine.setSleepTimer(totalMs)

    val captured = ArrayList<FloatArray>()
    val buffer = FloatArray(bufferFrames * 2)
    var cues = 0
    var nonFinite = 0
    var peak = 0f
    var audibleFrames = 0L
    val targetFrames = (totalMs / 1_000.0 * sampleRate).toLong()
    while (cumulativeFrames < targetFrames) {
      java.util.Arrays.fill(buffer, 0f)
      ProceduralAudioEngine.render(buffer, bufferFrames)
      cumulativeFrames += bufferFrames
      for (sample in buffer) {
        if (sample.isNaN() || sample.isInfinite()) nonFinite++
        peak = maxOf(peak, abs(sample))
      }
      if (buffer.any { abs(it) > 1e-4f }) audibleFrames += bufferFrames
      for (event in ProceduralAudioEngine.drainDiagnosticEvents()) if (event["type"] == "recognition_signal_fired") cues++
      captured.add(buffer.copyOf())
    }

    assertEquals("no non-finite samples", 0, nonFinite)
    assertEquals("both Bells fire", 2, cues)
    assertTrue("peak $peak stays under full scale", peak < 1.0f)
    assertTrue("audible for most of the journey", audibleFrames > targetFrames * 0.95)

    System.getenv("INDUCTION_WAV")?.takeIf { it.isNotBlank() }?.let { path ->
      val all = FloatArray(captured.sumOf { it.size })
      var offset = 0
      for (chunk in captured) { System.arraycopy(chunk, 0, all, offset, chunk.size); offset += chunk.size }
      File(path).writeBytes(wav(all, sampleRate.toInt()))
    }
  }
}
