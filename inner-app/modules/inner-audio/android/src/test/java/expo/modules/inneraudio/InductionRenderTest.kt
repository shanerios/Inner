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
 * Bell is the real signal file at its real gain, and the voice is the five recordings the app ships. It checks the
 * render is finite, audible, not clipped, that both Bells fire, and that all five voice clips are loaded and play.
 * Set INDUCTION_WAV to a path and it also writes the render as a 16-bit stereo WAV to listen to; set INDUCTION_VOICE=0
 * to render without the voice, to compare levels.
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
            signalGainScale = e.optDouble("signalGainScale", 1.0)
            clipId = e.optString("clipId", "")
          }
        }
      }
    }
  }

  private fun assetUri(relative: String): String {
    var directory: File? = File("").absoluteFile
    while (directory != null) {
      val candidate = File(directory, relative)
      if (candidate.exists()) return candidate.toURI().toString()
      directory = directory.parentFile
    }
    fail("$relative not found above ${File("").absolutePath}")
    return ""
  }

  private fun bellUri(): String = assetUri("assets/sounds/signal_bell.wav")

  private fun voiceClips(gainValue: Double): List<VoiceClipRecord> = listOf("induction-open-1", "induction-open-2", "induction-cue-1", "induction-cue-2", "induction-close").map { name ->
    VoiceClipRecord().apply {
      id = name
      uri = assetUri("assets/voice/$name.wav")
      gain = gainValue
    }
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

  @Test fun theInductionRendersCleanlyBothBellsFireAndTheVoiceSpeaksFiveTimes() {
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
    val withVoice = System.getenv("INDUCTION_VOICE") != "0"
    if (withVoice) ProceduralAudioEngine.setVoiceClips(voiceClips(fixture.getDouble("voiceGain")))
    ProceduralAudioEngine.checkpointSessionId = "induction-render"
    ProceduralAudioEngine.setSleepTimer(totalMs)

    val captured = ArrayList<FloatArray>()
    val buffer = FloatArray(bufferFrames * 2)
    var cues = 0
    val voiceStartsSeconds = ArrayList<Double>()
    var voiceMissing = 0
    var voicesLoaded = ""
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
      for (event in ProceduralAudioEngine.drainDiagnosticEvents()) {
        when (event["type"]) {
          "recognition_signal_fired" -> cues++
          "voice_clip_started" -> voiceStartsSeconds.add(cumulativeFrames.toDouble() / sampleRate)
          "voice_clip_missing" -> voiceMissing++
          "voice_clips_loaded" -> voicesLoaded = event["detail"].toString()
        }
      }
      captured.add(buffer.copyOf())
    }

    assertEquals("no non-finite samples", 0, nonFinite)
    assertEquals("both Bells fire", 2, cues)
    assertTrue("peak $peak stays under full scale", peak < 1.0f)
    assertTrue("audible for most of the journey", audibleFrames > targetFrames * 0.95)
    if (withVoice) {
      assertEquals("all five recordings are accepted by the engine", "loaded=5 requested=5", voicesLoaded)
      assertEquals("no clip is missing or overlapped", 0, voiceMissing)
      assertEquals("the voice speaks five times", 5, voiceStartsSeconds.size)
      // The opening at 0:41 and 1:02, a line before the first Bell at 1:23 and after the second at 4:21, the closing at 5:12.
      listOf(41.0, 62.0, 83.0, 261.0, 312.0).forEachIndexed { index, expected ->
        assertEquals("voice ${index + 1} starts on time", expected, voiceStartsSeconds[index], 0.1)
      }
    }

    System.getenv("INDUCTION_WAV")?.takeIf { it.isNotBlank() }?.let { path ->
      val all = FloatArray(captured.sumOf { it.size })
      var offset = 0
      for (chunk in captured) { System.arraycopy(chunk, 0, all, offset, chunk.size); offset += chunk.size }
      File(path).writeBytes(wav(all, sampleRate.toInt()))
    }
  }
}
