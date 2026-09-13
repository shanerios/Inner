package expo.modules.inneraudio

import android.content.Context
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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
      ContextCompat.startForegroundService(context, InnerAudioPlaybackService.playIntent(context))
    }

    AsyncFunction("pause") {
      if (InnerAudioPlaybackService.isRunning) {
        context.startService(InnerAudioPlaybackService.pauseIntent(context))
      }
    }

    AsyncFunction("stop") {
      if (InnerAudioPlaybackService.isRunning) {
        context.startService(InnerAudioPlaybackService.stopIntent(context))
      }
    }

    OnDestroy {
      if (InnerAudioPlaybackService.isRunning) {
        context.startService(InnerAudioPlaybackService.stopIntent(context))
      }
    }
  }
}
