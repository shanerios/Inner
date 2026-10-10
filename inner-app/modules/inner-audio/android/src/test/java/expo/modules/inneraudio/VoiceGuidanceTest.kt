package expo.modules.inneraudio

import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Drives the real production engine with recorded voice clips: a clip plays at its scheduled time and
 * the bed returns afterward; unloaded, overlapping and oversized clips are reported and skipped; and a
 * voice event is never mistaken for a recognition cue.
 */
class VoiceGuidanceTest {
  @get:Rule val folder = TemporaryFolder()

  private val bufferFrames = 960

  @Before fun setUp() {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.onSleepTimerElapsed = null
    ProceduralAudioEngine.checkpointSessionId = null
    ProceduralAudioEngine.setVoiceClips(emptyList())
  }

  @After fun cleanup() {
    ProceduralAudioEngine.setVoiceClips(emptyList())
    ProceduralAudioEngine.wallClockMs = { System.currentTimeMillis() }
    ProceduralAudioEngine.reset()
  }

  /** A 16-bit mono PCM WAV holding a steady tone, so any change in the output is easy to see. */
  private fun wavFile(name: String, seconds: Double, rate: Int = 24_000, amplitude: Double = 0.5): File {
    val frames = (seconds * rate).toInt()
    val data = ByteBuffer.allocate(frames * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until frames) data.putShort((sin(2 * PI * 220.0 * i / rate) * amplitude * 32767).toInt().toShort())
    val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray()).putInt(36 + data.capacity()).put("WAVE".toByteArray())
    header.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(rate).putInt(rate * 2).putShort(2).putShort(16)
    header.put("data".toByteArray()).putInt(data.capacity())
    return folder.newFile(name).also { it.writeBytes(header.array() + data.array()) }
  }

  private fun clip(id: String, file: File, gain: Double = 1.0) = VoiceClipRecord().apply {
    this.id = id; uri = file.toURI().toString(); this.gain = gain
  }

  private fun timeline(voice: List<Pair<String, Double>>, cueAtMs: Double? = null): AudioTimelineRecord = AudioTimelineRecord().apply {
    id = "voice-fixture"; title = "Voice fixture"; seed = 4_242.0
    stages = listOf(TimelineStageRecord().apply {
      id = "prep"; label = "Prep"; durationMs = 60_000.0
      config = AudioConfigRecord().apply { environment = "ocean"; environmentGain = 0.12; masterGain = 0.5 }
      spatialEvents = voice.map { (clipId, at) ->
        SpatialEventRecord().apply { id = clipId; atMs = at; type = "voice"; this.clipId = clipId }
      } + listOfNotNull(cueAtMs?.let { SpatialEventRecord().apply { id = "cue"; atMs = it; type = "cue" } })
    })
  }

  private class Rendered(val left: DoubleArray, val events: List<Map<String, Any>>)

  private fun render(timeline: AudioTimelineRecord, seconds: Double): Rendered {
    ProceduralAudioEngine.reset()
    ProceduralAudioEngine.configure(AudioConfigRecord())
    ProceduralAudioEngine.setTimeline(timeline)
    val rate = ProceduralAudioEngine.sampleRate
    val total = (seconds * rate).toInt()
    val left = DoubleArray(total)
    val events = mutableListOf<Map<String, Any>>()
    val buffer = FloatArray(bufferFrames * 2)
    var done = 0
    while (done < total) {
      java.util.Arrays.fill(buffer, 0f)
      ProceduralAudioEngine.render(buffer, bufferFrames)
      for (i in 0 until bufferFrames) if (done + i < total) left[done + i] = buffer[i * 2].toDouble()
      events.addAll(ProceduralAudioEngine.drainDiagnosticEvents())
      done += bufferFrames
    }
    return Rendered(left, events)
  }

  private fun rms(samples: DoubleArray, fromSeconds: Double, toSeconds: Double): Double {
    val rate = ProceduralAudioEngine.sampleRate
    val a = (fromSeconds * rate).toInt(); val b = minOf(samples.size, (toSeconds * rate).toInt())
    var sum = 0.0
    for (i in a until b) sum += samples[i] * samples[i]
    return sqrt(sum / (b - a))
  }

  private fun diffRms(a: DoubleArray, b: DoubleArray, fromSeconds: Double, toSeconds: Double): Double {
    val rate = ProceduralAudioEngine.sampleRate
    val from = (fromSeconds * rate).toInt(); val to = minOf(a.size, b.size, (toSeconds * rate).toInt())
    var sum = 0.0
    for (i in from until to) sum += (a[i] - b[i]) * (a[i] - b[i])
    return sqrt(sum / (to - from))
  }

  private fun eventsOf(rendered: Rendered, type: String) = rendered.events.filter { it["type"] == type }

  @Test fun aClipPlaysAtItsScheduledTimeAndTheBedReturns() {
    val file = wavFile("voice.wav", 3.0)
    ProceduralAudioEngine.setVoiceClips(listOf(clip("voice-a", file)))
    val without = render(timeline(emptyList()), 25.0)
    val with = render(timeline(listOf("voice-a" to 10_000.0)), 25.0)

    val started = eventsOf(with, "voice_clip_started")
    assertEquals(1, started.size)
    assertEquals("voice-a", started[0]["cueId"])
    assertTrue(abs(started[0]["driftMs"] as Double) < 50.0)
    // Audible while it speaks...
    val speaking = diffRms(with.left, without.left, 10.5, 12.5)
    assertTrue(speaking > 0.01)
    // ...after a short lead-in in which only the bed is easing down...
    assertTrue(diffRms(with.left, without.left, 10.0, 10.3) < speaking * 0.05)
    // ...silent before it begins...
    assertTrue(diffRms(with.left, without.left, 0.0, 9.9) < 1e-9)
    // ...and the bed is fully back, with nothing of the clip left, well after it ends.
    assertTrue(diffRms(with.left, without.left, 18.0, 25.0) < 1e-6)
  }

  @Test fun theBedEasesDownUnderTheVoiceButDoesNotDisappear() {
    val file = wavFile("voice.wav", 3.0, amplitude = 1e-6)
    ProceduralAudioEngine.setVoiceClips(listOf(clip("quiet", file)))
    val without = render(timeline(emptyList()), 25.0)
    val with = render(timeline(listOf("quiet" to 10_000.0)), 25.0)
    val bedWithout = rms(without.left, 11.0, 12.5)
    val bedWith = rms(with.left, 11.0, 12.5)
    assertTrue("bed ratio ${bedWith / bedWithout}", bedWith < bedWithout * 0.8 && bedWith > bedWithout * 0.6)
  }

  @Test fun anUnloadedClipIsReportedAndLeavesTheNightUntouched() {
    val without = render(timeline(emptyList()), 20.0)
    val with = render(timeline(listOf("not-loaded" to 5_000.0)), 20.0)
    val missing = eventsOf(with, "voice_clip_missing")
    assertEquals(1, missing.size)
    assertEquals("not_loaded", missing[0]["reason"])
    assertEquals(0, eventsOf(with, "voice_clip_started").size)
    assertTrue(diffRms(with.left, without.left, 0.0, 20.0) < 1e-12)
  }

  @Test fun aSecondClipWhileOneIsSpeakingIsSkippedNotStacked() {
    val file = wavFile("voice.wav", 4.0)
    ProceduralAudioEngine.setVoiceClips(listOf(clip("first", file), clip("second", file)))
    val rendered = render(timeline(listOf("first" to 5_000.0, "second" to 6_500.0)), 20.0)
    assertEquals(listOf("first"), eventsOf(rendered, "voice_clip_started").map { it["cueId"] })
    val missing = eventsOf(rendered, "voice_clip_missing")
    assertEquals(1, missing.size)
    assertEquals("overlap", missing[0]["reason"])
  }

  @Test fun anOversizedOrBrokenClipIsSkippedAndTheOthersStillLoad() {
    val tooLong = wavFile("long.wav", 21.0, rate = 8_000)
    val broken = folder.newFile("broken.wav").also { it.writeText("not a wav") }
    val good = wavFile("good.wav", 2.0)
    ProceduralAudioEngine.setVoiceClips(listOf(clip("long", tooLong), clip("broken", broken), clip("good", good)))
    val invalid = ProceduralAudioEngine.drainDiagnosticEvents().filter { it["type"] == "voice_clip_missing" }
    assertEquals(setOf("long", "broken"), invalid.map { it["cueId"] }.toSet())
    val rendered = render(timeline(listOf("good" to 4_000.0, "long" to 12_000.0)), 20.0)
    assertEquals(listOf("good"), eventsOf(rendered, "voice_clip_started").map { it["cueId"] })
  }

  @Test fun aVoiceEventIsNeverARecognitionCue() {
    val file = wavFile("voice.wav", 2.0)
    ProceduralAudioEngine.setVoiceClips(listOf(clip("voice-a", file)))
    val rendered = render(timeline(listOf("voice-a" to 5_000.0), cueAtMs = 30_000.0), 40.0)
    val fired = eventsOf(rendered, "recognition_signal_fired")
    assertEquals(1, fired.size)
    assertEquals("prep/cue", fired[0]["cueId"])
    assertEquals(1, eventsOf(rendered, "voice_clip_started").size)
  }

  @Test fun theClipGainScalesWhatIsHeardAndIsBounded() {
    val file = wavFile("voice.wav", 2.0)
    ProceduralAudioEngine.setVoiceClips(listOf(clip("voice-a", file, gain = 1.0)))
    val base = render(timeline(listOf("voice-a" to 5_000.0)), 12.0)
    ProceduralAudioEngine.setVoiceClips(listOf(clip("voice-a", file, gain = 0.5)))
    val half = render(timeline(listOf("voice-a" to 5_000.0)), 12.0)
    ProceduralAudioEngine.setVoiceClips(listOf(clip("voice-a", file, gain = 50.0)))
    val capped = render(timeline(listOf("voice-a" to 5_000.0)), 12.0)
    val without = render(timeline(emptyList()), 12.0)
    val full = diffRms(base.left, without.left, 5.5, 6.5)
    val halved = diffRms(half.left, without.left, 5.5, 6.5)
    assertTrue("half ${halved / full}", halved / full in 0.4..0.6)
    // A wildly large gain is clamped to +6 dB, so at most twice the unity level.
    assertTrue(diffRms(capped.left, without.left, 5.5, 6.5) / full <= 2.1)
  }
}
