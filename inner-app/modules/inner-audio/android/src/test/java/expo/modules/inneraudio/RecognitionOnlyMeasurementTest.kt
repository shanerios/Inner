package expo.modules.inneraudio

import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Digital measurements of the real ProceduralAudioEngine, rendered offline, for Recognition Only.
 * Fixtures come from the production TypeScript builders (see nativeFixtures.generate.test.ts), and the
 * recognition signals are the shipped WAV assets. Android engine only: nothing here says anything about
 * iOS, AudioTrack, the device output path or the phone's volume.
 */
class RecognitionOnlyMeasurementTest {
  @After fun cleanup() {
    ProceduralAudioEngine.wallClockMs = { System.currentTimeMillis() }
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    ProceduralAudioEngine.reset()
  }

  private val assets = File("../../../assets/sounds").canonicalFile
  private data class Signal(val id: String, val file: String?, val trimDb: Double, val durationMs: Double)
  private val signals = listOf(
    Signal("ascending", null, -16.6, 7_760.0),
    Signal("bell", "signal_bell.wav", -3.1, 4_741.0),
    Signal("chimes", "signal_chimes.wav", 3.7, 6_727.0),
    Signal("droplets", "signal_droplets.wav", 2.5, 4_759.0),
    Signal("guardian", "signal_guardian.wav", 5.6, 5_000.0),
  )

  private fun configFrom(json: JSONObject) = AudioConfigRecord().apply {
    carrierHz = json.getDouble("carrierHz"); binauralCarrierHz = json.getDouble("binauralCarrierHz")
    binauralDeltaHz = json.getDouble("binauralDeltaHz"); toneGain = json.getDouble("toneGain")
    harmonicWarmth = json.getDouble("harmonicWarmth"); binauralGain = json.getDouble("binauralGain")
    noiseColor = if (json.isNull("noiseColor")) null else json.getString("noiseColor")
    noiseGain = json.getDouble("noiseGain"); environment = json.getString("environment")
    environmentGain = json.getDouble("environmentGain"); environmentIntensity = json.getDouble("environmentIntensity")
    thresholdShift = json.getDouble("thresholdShift"); identityPresence = json.getDouble("identityPresence")
    identityDensity = json.getDouble("identityDensity"); identityVariety = json.getDouble("identityVariety")
    noiseHighCutHz = json.getDouble("noiseHighCutHz"); noiseWidth = json.getDouble("noiseWidth")
    noiseDriftDb = json.getDouble("noiseDriftDb"); noiseDriftSeconds = json.getDouble("noiseDriftSeconds")
    binauralBreathDb = json.getDouble("binauralBreathDb"); binauralBreathInSeconds = json.getDouble("binauralBreathInSeconds")
    binauralBreathOutSeconds = json.getDouble("binauralBreathOutSeconds"); binauralBreathVariation = json.getDouble("binauralBreathVariation")
    harmonicTranslation = json.getDouble("harmonicTranslation"); templeGain = json.getDouble("templeGain")
    templeIntensity = json.getDouble("templeIntensity"); masterGain = json.getDouble("masterGain")
    rampMs = json.getDouble("rampMs"); spatialMode = json.getString("spatialMode")
    spatialTarget = json.getString("spatialTarget"); spatialDepth = json.getDouble("spatialDepth")
    spatialRate = json.getDouble("spatialRate")
  }

  /** Cue start times (absolute ms) taken from the fixture, in order. */
  private class Fixture(val timeline: AudioTimelineRecord, val cueStartsMs: List<Double>, val totalMs: Double)

  private fun load(name: String): Fixture {
    val json = JSONObject(javaClass.classLoader!!.getResourceAsStream(name)!!.bufferedReader().readText())
    val cueStarts = mutableListOf<Double>()
    var cursor = 0.0
    val stagesJson = json.getJSONArray("stages")
    val timeline = AudioTimelineRecord().apply {
      id = name; title = json.getString("title"); seed = json.getDouble("seed")
      fadeInMs = json.optDouble("fadeInMs", 0.0)
      stages = (0 until stagesJson.length()).map { i ->
        val s = stagesJson.getJSONObject(i)
        val events = s.getJSONArray("spatialEvents")
        for (j in 0 until events.length()) {
          val e = events.getJSONObject(j)
          if (e.getString("type") == "cue") cueStarts.add(cursor + e.getDouble("atMs"))
        }
        cursor += s.getDouble("durationMs")
        TimelineStageRecord().apply {
          id = s.getString("id"); label = s.getString("label")
          durationMs = s.getDouble("durationMs"); transitionMs = s.getDouble("transitionMs")
          config = configFrom(s.getJSONObject("config"))
          spatialEvents = (0 until events.length()).map { j ->
            val e = events.getJSONObject(j)
            SpatialEventRecord().apply {
              id = e.getString("id"); atMs = e.getDouble("atMs"); type = e.getString("type")
              recognitionSpace = e.optBoolean("recognitionSpace", false)
              signalGainScale = e.optDouble("signalGainScale", 1.0)
              recoverySeconds = e.optDouble("recoverySeconds", 30.0)
              applyExtra(e)
            }
          }
        }
      }
    }
    return Fixture(timeline, cueStarts, cursor)
  }

  /** Hook for fields added to the cue event later; unused until then. */
  private fun SpatialEventRecord.applyExtra(e: JSONObject) {}

  class Result(
    val silentPeak: Float, val silentSamples: Long, val cuePeaks: List<Float>, val checksum: Long,
    val attackPeaks: List<DoubleArray>, val cueRms: List<Double>, val frames: Long,
  )

  private fun render(fixtureName: String, signal: Signal, signalGainScale: Double?): Result {
    val fx = load(fixtureName)
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    val sr = ProceduralAudioEngine.sampleRate
    var frames = 0L
    ProceduralAudioEngine.wallClockMs = { (frames * 1_000.0 / sr).toLong() }
    ProceduralAudioEngine.configure(AudioConfigRecord())
    val uri = signal.file?.let { File(assets, it).toURI().toString() }
    ProceduralAudioEngine.setRecognitionSignal(signal.id, uri, Math.pow(10.0, signal.trimDb / 20.0))
    ProceduralAudioEngine.setTimeline(fx.timeline)
    ProceduralAudioEngine.setSleepTimer(fx.totalMs)
    val windowsMs = fx.cueStartsMs.map { (it - 100.0) to (it + signal.durationMs + 1_500.0) }
    val buffer = FloatArray(960 * 2)
    var silentPeak = 0f; var silentSamples = 0L; var checksum = 1125899906842597L
    val cuePeaks = MutableList(windowsMs.size) { 0f }
    val cueSq = MutableList(windowsMs.size) { 0.0 }; val cueN = MutableList(windowsMs.size) { 0L }
    // Peak magnitude in the first 10, 50, 100, 250 ms after each cue's scheduled start.
    val attackEdges = doubleArrayOf(10.0, 50.0, 100.0, 250.0)
    val attack = MutableList(windowsMs.size) { DoubleArray(attackEdges.size) }
    val endFrames = ((fx.totalMs + 2_000.0) * sr / 1_000.0).toLong()
    while (frames < endFrames) {
      java.util.Arrays.fill(buffer, 0f)
      ProceduralAudioEngine.render(buffer, 960)
      for (f in 0 until 960) {
        val tMs = (frames + f) * 1_000.0 / sr
        val idx = windowsMs.indexOfFirst { tMs >= it.first && tMs < it.second }
        for (c in 0..1) {
          val v = buffer[f * 2 + c]
          checksum = checksum * 31 + java.lang.Float.floatToIntBits(v)
          val a = abs(v)
          if (idx < 0) { silentSamples++; if (a > silentPeak) silentPeak = a }
          else {
            if (a > cuePeaks[idx]) cuePeaks[idx] = a
            cueSq[idx] += v.toDouble() * v.toDouble(); cueN[idx]++
            val since = tMs - fx.cueStartsMs[idx]
            for (k in attackEdges.indices) if (since in 0.0..attackEdges[k] && a > attack[idx][k]) attack[idx][k] = a.toDouble()
          }
        }
      }
      frames += 960
    }
    return Result(silentPeak, silentSamples, cuePeaks, checksum, attack, cueSq.indices.map { if (cueN[it] > 0) sqrt(cueSq[it] / cueN[it]) else 0.0 }, frames)
  }

  private fun db(x: Double) = 20 * log10(maxOf(x, 1e-12))

  @Test fun recognitionOnlySilenceAndCueLevels() {
    val sb = StringBuilder()
    for (signal in signals) {
      val r = render("recognition-only-accelerated-fixture.json", signal, null)
      sb.append("RO ${signal.id}: silentSamples=${r.silentSamples} silentPeak=${r.silentPeak} (${db(r.silentPeak.toDouble()).toInt()} dBFS) ")
      sb.append("cuePeaks=${r.cuePeaks.map { "%.1f".format(db(it.toDouble())) }} dBFS attackPeaks(10/50/100/250ms, cue1)=${r.attackPeaks.first().map { "%.1f".format(db(it)) }} checksum=${r.checksum}\n")
      assertEquals("digital silence outside cue windows for ${signal.id}", 0f, r.silentPeak, 0f)
      assertTrue("cues must sound for ${signal.id}", r.cuePeaks.all { it > 0f })
    }
    val full = render("full-reference-accelerated-fixture.json", signals[1], null)
    sb.append("FULL bell: silentPeakOutsideCues=${full.silentPeak} (${db(full.silentPeak.toDouble()).toInt()} dBFS) cuePeaks=${full.cuePeaks.map { "%.1f".format(db(it.toDouble())) }} checksum=${full.checksum}\n")
    println("MEASUREMENT\n$sb")
    File("build/recognition-only-measurement.txt").writeText(sb.toString())
  }
}
