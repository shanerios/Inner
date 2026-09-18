package expo.modules.inneraudio

import android.content.Context
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// A start normally answers within a fraction of a second; this only bounds a
// service that never answers so the JS side is not held indefinitely.
private const val PLAY_ACK_TIMEOUT_MS = 4_000L
private const val STOP_ACK_TIMEOUT_MS = 1_500L

// Shared with iOS and matched by JS (core/audio/startFailure.ts): another app or
// a call is holding the audio output, so this start cannot produce sound.
private const val AUDIO_BUSY_CODE = "ERR_AUDIO_BUSY"

class InnerAudioModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("InnerAudio requires an active React context")

  override fun definition() = ModuleDefinition {
    Name("InnerAudio")

    Function("isAvailable") { true }

    AsyncFunction("configure") { config: AudioConfigRecord ->
      ProceduralAudioEngine.configure(config)
    }

    AsyncFunction("setTimeline") { timeline: AudioTimelineRecord? ->
      ProceduralAudioEngine.setTimeline(timeline)
    }

    AsyncFunction("seekTimeline") { positionMs: Double ->
      ProceduralAudioEngine.seekTimeline(positionMs)
    }

    AsyncFunction("setNowPlaying") { title: String ->
      ProceduralAudioEngine.nowPlayingTitle = title.ifEmpty { "Inner" }
      if (InnerAudioPlaybackService.isRunning) {
        context.startService(InnerAudioPlaybackService.refreshNowPlayingIntent(context))
      }
    }

    AsyncFunction("setSleepTimer") { endAtMs: Double? ->
      ProceduralAudioEngine.setSleepTimer(endAtMs)
    }

    Function("getLastTimerCompletionAtMs") {
      ProceduralAudioEngine.lastTimerCompletionAtMs
    }

    Function("getPlaybackState") {
      InnerAudioPlaybackService.playbackState
    }

    Function("getEngineDebugState") {
      InnerAudioPlaybackService.debugState()
    }

    Function("getTimelinePositionMs") {
      ProceduralAudioEngine.getTimelinePositionMs()
    }

    Function("drainDiagnosticEvents") {
      ProceduralAudioEngine.drainDiagnosticEvents()
    }

    AsyncFunction("setRecognitionSignal") { signalId: String?, uri: String? ->
      ProceduralAudioEngine.setRecognitionSignal(signalId, uri)
    }

    AsyncFunction("triggerCue") {
      ProceduralAudioEngine.triggerCue()
    }

    AsyncFunction("setCheckpointSessionId") { sessionId: String? ->
      ProceduralAudioEngine.checkpointSessionId = sessionId
    }

    Function("getCheckpoint") {
      InnerAudioPlaybackService.readPersistedCheckpoint(context)
    }

    AsyncFunction("clearCheckpoint") {
      InnerAudioPlaybackService.clearPersistedCheckpoint(context)
    }

    AsyncFunction("play") {
      val ack = InnerAudioPlaybackService.armPlayAck()
      ContextCompat.startForegroundService(context, InnerAudioPlaybackService.playIntent(context))
      // Resolve only once the service has answered, so a denied or failed
      // start reaches JS as an error instead of a promise that already said yes.
      when (val outcome = ack.await(PLAY_ACK_TIMEOUT_MS)) {
        "playing" -> Unit
        null -> ProceduralAudioEngine.recordDiagnostic("error", "start_ack_timeout")
        "focus_denied" -> throw CodedException(AUDIO_BUSY_CODE, "Audio was not started because another app is holding the audio output.", null)
        else -> throw IllegalStateException("Audio could not be started ($outcome).")
      }
    }

    AsyncFunction("pause") {
      if (InnerAudioPlaybackService.isRunning) {
        context.startService(InnerAudioPlaybackService.pauseIntent(context))
      }
    }

    AsyncFunction("stop") {
      if (InnerAudioPlaybackService.isRunning) {
        val ack = InnerAudioPlaybackService.armStopAck()
        context.startService(InnerAudioPlaybackService.stopIntent(context))
        // Resolve after teardown has finished: a stop still in flight when the
        // next session configures would otherwise wipe that session's state.
        if (ack.await(STOP_ACK_TIMEOUT_MS) == null) {
          ProceduralAudioEngine.recordDiagnostic("error", "stop_ack_timeout")
        }
      }
    }

    OnDestroy {
      if (InnerAudioPlaybackService.isRunning) {
        context.startService(InnerAudioPlaybackService.stopIntent(context))
      }
    }
  }
}
