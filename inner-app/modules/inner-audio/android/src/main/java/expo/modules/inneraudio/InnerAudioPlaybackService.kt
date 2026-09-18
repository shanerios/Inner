package expo.modules.inneraudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import org.json.JSONArray
import org.json.JSONObject
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media.session.MediaButtonReceiver
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

/**
 * One-shot signal from the service back to the JS-facing module, so that
 * `play` and `stop` can resolve when the service has actually finished the work
 * rather than when the intent was merely queued.
 */
internal class LifecycleAck {
  private val latch = CountDownLatch(1)
  @Volatile private var result: String? = null

  fun complete(value: String) {
    if (result == null) result = value
    latch.countDown()
  }

  /** Returns the result, or null if the service did not answer in time. */
  fun await(timeoutMs: Long): String? {
    try { latch.await(timeoutMs, TimeUnit.MILLISECONDS) } catch (_: InterruptedException) { }
    return result
  }
}

/**
 * Foreground playback service backing the InnerAudio procedural engine.
 *
 * Communication from [InnerAudioModule] happens via action Intents (ACTION_PLAY etc.)
 * rather than binding, since every command the JS layer sends is fire-and-forget and this
 * avoids ServiceConnection race conditions around the very first `play()` call. Engine
 * parameters (configure/setTimeline/seek/sleep timer/now-playing title) live on the
 * [ProceduralAudioEngine] singleton itself, independent of whether this service is running —
 * this mirrors the iOS module, where `ProceduralAudioEngine` always exists regardless of
 * whether the underlying AVAudioEngine is started.
 */
class InnerAudioPlaybackService : Service() {

  private enum class PauseReason { USER, ROUTE_LOSS, INTERRUPTION }

  companion object {
    private const val ACTION_PLAY = "expo.modules.inneraudio.action.PLAY"
    private const val ACTION_PAUSE = "expo.modules.inneraudio.action.PAUSE"
    private const val ACTION_STOP = "expo.modules.inneraudio.action.STOP"
    private const val ACTION_REFRESH_NOW_PLAYING = "expo.modules.inneraudio.action.REFRESH_NOW_PLAYING"

    private const val CHANNEL_ID = "inner_audio_playback"
    private const val NOTIFICATION_ID = 8420
    private const val RENDER_CHUNK_FRAMES = 960
    private const val ROUTE_LOG_TAG = "InnerAudioRoute"
    private const val MEDIA_PAUSE_ROUTE_GRACE_MS = 3_000L
    private const val CHECKPOINT_PREFS_NAME = "inner_audio_checkpoint"
    private const val CHECKPOINT_PREFS_KEY = "checkpoint_json"
    private const val CHECKPOINT_INTERVAL_MS = 20_000L

    @Volatile var isRunning = false
      private set

    @Volatile var playbackState = "stopped"
      private set

    /** Why the service last stopped (user, sleep timer, media control, ...). Diagnostics only. */
    @Volatile var lastStopReason: String? = null
      private set

    @Volatile private var pendingPlayAck: LifecycleAck? = null
    @Volatile private var pendingStopAck: LifecycleAck? = null

    internal fun armPlayAck(): LifecycleAck = LifecycleAck().also { pendingPlayAck = it }
    internal fun armStopAck(): LifecycleAck = LifecycleAck().also { pendingStopAck = it }

    private fun completePlayAck(result: String) {
      pendingPlayAck?.complete(result)
      pendingPlayAck = null
    }

    private fun completeStopAck() {
      pendingStopAck?.complete("stopped")
      pendingStopAck = null
    }

    fun debugState(): Map<String, Any?> = ProceduralAudioEngine.debugState() + mapOf(
      "playbackState" to playbackState,
      "engineRunning" to isRunning,
      "lastStopReason" to lastStopReason,
    )

    fun playIntent(context: Context): Intent = Intent(context, InnerAudioPlaybackService::class.java).setAction(ACTION_PLAY)
    fun pauseIntent(context: Context): Intent = Intent(context, InnerAudioPlaybackService::class.java).setAction(ACTION_PAUSE)
    fun stopIntent(context: Context): Intent = Intent(context, InnerAudioPlaybackService::class.java).setAction(ACTION_STOP)
    fun refreshNowPlayingIntent(context: Context): Intent =
      Intent(context, InnerAudioPlaybackService::class.java).setAction(ACTION_REFRESH_NOW_PLAYING)

    /**
     * Reads whatever checkpoint was last persisted to disk, independent of
     * whether this service is currently running -- this is what lets a cold
     * app launch after a process kill find out what happened. Does not clear
     * it; the caller decides once it has reconciled the outcome.
     */
    fun readPersistedCheckpoint(context: Context): Map<String, Any?>? {
      val raw = context.getSharedPreferences(CHECKPOINT_PREFS_NAME, Context.MODE_PRIVATE)
        .getString(CHECKPOINT_PREFS_KEY, null) ?: return null
      return try {
        val json = JSONObject(raw)
        val fired = json.optJSONArray("firedSignalIds")
        val diagnostics = json.optJSONArray("pendingDiagnostics")
        mapOf(
          "sessionId" to json.optString("sessionId"),
          "positionMs" to json.optDouble("positionMs"),
          "lastUpdatedAt" to json.optDouble("lastUpdatedAt"),
          "firedSignalIds" to (fired?.let { array -> List(array.length()) { array.getString(it) } } ?: emptyList<String>()),
          "plannedSignalCount" to if (json.has("plannedSignalCount")) json.getInt("plannedSignalCount") else null,
          "pendingDiagnostics" to (diagnostics?.let { array ->
            List(array.length()) { index ->
              val event = array.getJSONObject(index)
              val map = mutableMapOf<String, Any?>("type" to event.getString("type"), "atMs" to event.getDouble("atMs"))
              if (event.has("reason")) map["reason"] = event.getString("reason")
              if (event.has("route")) map["route"] = event.getString("route")
              if (event.has("signalId")) map["signalId"] = event.getString("signalId")
              if (event.has("scheduledPositionMs")) map["scheduledPositionMs"] = event.getDouble("scheduledPositionMs")
              if (event.has("actualPositionMs")) map["actualPositionMs"] = event.getDouble("actualPositionMs")
              if (event.has("driftMs")) map["driftMs"] = event.getDouble("driftMs")
              if (event.has("underrunCount")) map["underrunCount"] = event.getInt("underrunCount")
              map
            }
          } ?: emptyList<Map<String, Any?>>()),
        )
      } catch (_: Exception) {
        null
      }
    }

    fun clearPersistedCheckpoint(context: Context) {
      context.getSharedPreferences(CHECKPOINT_PREFS_NAME, Context.MODE_PRIVATE).edit().remove(CHECKPOINT_PREFS_KEY).apply()
    }
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private var mediaSession: MediaSessionCompat? = null
  private var audioTrack: AudioTrack? = null
  private var renderThread: Thread? = null
  private val renderThreadRunning = AtomicBoolean(false)
  private val renderThreadPaused = AtomicBoolean(true)
  private var lastUnderrunCount = 0
  private var pauseReason: PauseReason? = null

  /** Whether playback should resume once an interruption (focus loss, noisy route) clears. */
  private var desiredPlaying = false
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private var deviceCallbackRegistered = false
  private var noisyReceiverRegistered = false
  private var activePrivateDeviceId: Int? = null
  private var lastMediaSessionPauseAtElapsedMs = Long.MIN_VALUE
  private var explicitAppPause = false

  private val checkpointRunnable = object : Runnable {
    override fun run() {
      persistCheckpoint()
      mainHandler.postDelayed(this, CHECKPOINT_INTERVAL_MS)
    }
  }

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action != AudioManager.ACTION_AUDIO_BECOMING_NOISY) return
      routeLog("becoming_noisy received")
      pauseForRouteLoss("becoming_noisy")
    }
  }

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      val addedPrivateOutput = addedDevices.any(::isPrivateOutput)
      routeLog("devices_added=${describeDevices(addedDevices)} private=$addedPrivateOutput")
      ProceduralAudioEngine.recordDiagnostic("audio_route_changed", "device_added", if (addedPrivateOutput) "private" else "speaker")
      val priorPrivateDeviceId = activePrivateDeviceId
      val isNewPrivateRoute = priorPrivateDeviceId != null && addedDevices.any {
        isPrivateOutput(it) && it.id != priorPrivateDeviceId
      }
      if (isNewPrivateRoute && pauseReason == PauseReason.USER && !explicitAppPause && audioTrack != null) {
        routeLog("paused_session_upgraded_to_route_loss_on_reconnect")
        desiredPlaying = true
        pauseReason = PauseReason.ROUTE_LOSS
      }
      if (addedPrivateOutput && pauseReason == PauseReason.ROUTE_LOSS) {
        mainHandler.postDelayed(::resumeAfterRouteLoss, 500L)
        mainHandler.postDelayed(::resumeAfterRouteLoss, 1_500L)
        mainHandler.postDelayed(::resumeAfterRouteLoss, 3_000L)
        return
      }
      mainHandler.postDelayed({ if (isPlaying()) refreshActivePrivateDevice() }, 350L)
      mainHandler.postDelayed({ if (isPlaying()) refreshActivePrivateDevice() }, 1_500L)
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      val removedPrivateOutput = removedDevices.any(::isPrivateOutput)
      routeLog("devices_removed=${describeDevices(removedDevices)} private=$removedPrivateOutput activeId=$activePrivateDeviceId")
      if (!removedPrivateOutput) return

      val activeId = activePrivateDeviceId
      val removedActiveOutput = activeId != null && removedDevices.any { it.id == activeId }
      if (removedActiveOutput || (isPlaying() && !hasPrivateOutput())) {
        val followedMediaPause = lastMediaSessionPauseAtElapsedMs != Long.MIN_VALUE &&
          pauseReason == PauseReason.USER &&
          SystemClock.elapsedRealtime() - lastMediaSessionPauseAtElapsedMs <= MEDIA_PAUSE_ROUTE_GRACE_MS
        if (followedMediaPause) {
          routeLog("media_pause_upgraded_to_route_loss source=private_device_removed")
          desiredPlaying = true
          pauseReason = PauseReason.ROUTE_LOSS
          ProceduralAudioEngine.recordDiagnostic("audio_route_changed", "private_device_removed", "speaker")
        } else {
          pauseForRouteLoss("private_device_removed")
        }
      }
    }
  }

  private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
    routeLog("focus_change=$focusChange")
    when (focusChange) {
      AudioManager.AUDIOFOCUS_LOSS -> {
        ProceduralAudioEngine.recordDiagnostic("interruption_began", "focus_loss")
        if (pauseReason != PauseReason.ROUTE_LOSS) {
          desiredPlaying = false
          pause(PauseReason.INTERRUPTION)
        }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        ProceduralAudioEngine.recordDiagnostic("interruption_began", "focus_loss_transient")
        if (pauseReason != PauseReason.ROUTE_LOSS) pause(PauseReason.INTERRUPTION)
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> audioTrack?.setVolume(0.35f)
      AudioManager.AUDIOFOCUS_GAIN -> {
        ProceduralAudioEngine.recordDiagnostic("interruption_ended", "focus_gain")
        audioTrack?.setVolume(1.0f)
        if (desiredPlaying) play("interruption_recovered", gentleFadeIn = true)
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    playbackState = "stopped"
    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    createNotificationChannel()
    registerNoisyReceiver()
    ProceduralAudioEngine.onSleepTimerElapsed = { mainHandler.post { stop("sleep_timer") } }
    mediaSession = MediaSessionCompat(this, "InnerAudio").apply {
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          desiredPlaying = true
          play("media_control")
        }
        override fun onPause() {
          if (pauseReason == PauseReason.ROUTE_LOSS) return
          lastMediaSessionPauseAtElapsedMs = SystemClock.elapsedRealtime()
          explicitAppPause = false
          routeLog("media_session_pause")
          desiredPlaying = false
          pause(PauseReason.USER)
        }
        override fun onStop() = stop("media_control")
      })
      isActive = true
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PLAY -> {
        desiredPlaying = true
        play("play_request")
      }
      ACTION_PAUSE -> {
        lastMediaSessionPauseAtElapsedMs = Long.MIN_VALUE
        explicitAppPause = true
        desiredPlaying = false
        pause(PauseReason.USER)
      }
      ACTION_STOP -> stop("stop_request")
      ACTION_REFRESH_NOW_PLAYING -> updateNowPlaying(isPlaying())
      else -> mediaSession?.let { MediaButtonReceiver.handleIntent(it, intent) }
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    // Preserve the last checkpoint when Android destroys the service without
    // an explicit stop; the next cold launch can then reconcile the session.
    if (lastStopReason == null) lastStopReason = "service_destroyed"
    teardownPlayback(clearCheckpoint = false)
    mediaSession?.release()
    mediaSession = null
    ProceduralAudioEngine.onSleepTimerElapsed = null
    unregisterNoisyReceiver()
    isRunning = false
    // The instance is fully torn down: nothing of this session can touch the
    // engine any more, so a waiting stop() may return and a waiting play()
    // need not wait out its timeout.
    completePlayAck("stopped")
    completeStopAck()
    super.onDestroy()
  }

  private fun isPlaying() = renderThreadRunning.get() && !renderThreadPaused.get()

  private fun play(reason: String, gentleFadeIn: Boolean = false) {
    val focusGranted = requestAudioFocus()
    routeLog("play reason=$reason focusGranted=$focusGranted gentle=$gentleFadeIn")
    if (!focusGranted) {
      failStart("audio_focus_denied", "focus_denied")
      return
    }
    explicitAppPause = false
    try {
      if (audioTrack == null) {
        ProceduralAudioEngine.sampleRate = preferredSampleRate()
        audioTrack = buildAudioTrack()
        startRenderThread()
      }
      pauseReason = null
      ProceduralAudioEngine.resumeSleepTimer()
      if (gentleFadeIn) audioTrack?.setVolume(0f) else audioTrack?.setVolume(1f)
      audioTrack?.play()
    } catch (error: Exception) {
      // A platform failure here used to escape onStartCommand and take the
      // whole app down; report it and leave nothing half-started instead.
      teardownPlayback(clearCheckpoint = false)
      failStart("audio_track_start_failed:${error.javaClass.simpleName}", "error:${error.javaClass.simpleName}")
      return
    }
    renderThreadPaused.set(false)
    playbackState = "playing"
    registerDeviceCallbackIfNeeded()
    refreshActivePrivateDevice()
    // A2DP routing may not be populated synchronously with AudioTrack.play().
    mainHandler.postDelayed({ if (isPlaying()) refreshActivePrivateDevice() }, 1_000L)
    mainHandler.postDelayed({ if (isPlaying()) refreshActivePrivateDevice() }, 3_000L)
    startForegroundCompat(buildNotification(isPlaying = true))
    updateNowPlaying(isPlaying = true)
    if (gentleFadeIn) rampTrackVolume()
    ProceduralAudioEngine.recordDiagnostic("playback_resumed", reason)
    mainHandler.removeCallbacks(checkpointRunnable)
    persistCheckpoint()
    mainHandler.postDelayed(checkpointRunnable, CHECKPOINT_INTERVAL_MS)
    completePlayAck("playing")
  }

  /**
   * A start that cannot produce audio must still answer the system's
   * startForegroundService() request -- an app that never does is killed --
   * and must say why, instead of returning without a trace. The service stays
   * up, paused, so its notification offers Play and JS can retry or stop it.
   */
  private fun failStart(diagnosticReason: String, ackResult: String) {
    ProceduralAudioEngine.recordDiagnostic("error", diagnosticReason)
    // A denied resume leaves a live, paused track behind; only a start that
    // never built one is truly stopped.
    playbackState = if (audioTrack == null) "stopped" else "paused"
    try {
      startForegroundCompat(buildNotification(isPlaying = false))
    } catch (error: Exception) {
      ProceduralAudioEngine.recordDiagnostic("error", "start_foreground_failed:${error.javaClass.simpleName}")
    }
    updatePlaybackState(PlaybackStateCompat.STATE_PAUSED)
    completePlayAck(ackResult)
  }

  /**
   * Writes a small checkpoint to disk so a process kill (Doze, App Standby,
   * force-stop, low-memory) leaves behind something to reconcile from on the
   * next cold launch. There is no reliable "about to die" callback for a hard
   * kill, so this runs on a cadence rather than waiting for one -- whatever
   * was last written here is all a relaunch has to work with.
   */
  private fun persistCheckpoint() {
    val snapshot = ProceduralAudioEngine.checkpointSnapshot() ?: return
    val pendingDiagnostics = JSONArray().apply {
      for (event in ProceduralAudioEngine.peekDiagnosticEvents()) {
        put(JSONObject().apply {
          for ((key, value) in event) put(key, value)
        })
      }
    }
    val json = JSONObject().apply {
      put("sessionId", snapshot["sessionId"] as? String ?: return)
      put("positionMs", snapshot["positionMs"] as? Double ?: 0.0)
      @Suppress("UNCHECKED_CAST")
      put("firedSignalIds", JSONArray(snapshot["firedSignalIds"] as? List<String> ?: emptyList<String>()))
      put("plannedSignalCount", snapshot["plannedSignalCount"] as? Int ?: 0)
      put("lastUpdatedAt", System.currentTimeMillis().toDouble())
      put("pendingDiagnostics", pendingDiagnostics)
    }
    getSharedPreferences(CHECKPOINT_PREFS_NAME, Context.MODE_PRIVATE).edit()
      .putString(CHECKPOINT_PREFS_KEY, json.toString())
      .apply()
  }

  private fun pause(reason: PauseReason) {
    routeLog("pause reason=$reason")
    pauseReason = reason
    ProceduralAudioEngine.pauseSleepTimer()
    renderThreadPaused.set(true)
    audioTrack?.pause()
    playbackState = if (audioTrack == null) "stopped" else "paused"
    updateNowPlaying(isPlaying = false)
    ProceduralAudioEngine.recordDiagnostic("playback_paused", when (reason) {
      PauseReason.USER -> "user_pause"
      PauseReason.ROUTE_LOSS -> "route_loss"
      PauseReason.INTERRUPTION -> "interruption"
    })
    mainHandler.removeCallbacks(checkpointRunnable)
    persistCheckpoint()
  }

  private fun stop(reason: String = "stop_request") {
    lastStopReason = reason
    ProceduralAudioEngine.recordDiagnostic("playback_stopped", reason)
    desiredPlaying = false
    pauseReason = null
    explicitAppPause = false
    teardownPlayback(clearCheckpoint = true)
    mediaSession?.isActive = false
    stopForegroundCompat()
    stopSelf()
    completePlayAck("stopped")
    // The stop acknowledgement is deliberately NOT completed here: stopSelf()
    // queues onDestroy(), which tears down and resets the engine once more.
    // Answering only after that lets JS configure the next session without a
    // late reset landing on top of it.
  }

  /**
   * Idempotent — safe to call from both stop() and onDestroy(). Only reached
   * on a clean stop/destroy, so clearing the checkpoint here is correct: a
   * hard process kill never runs this at all, which is exactly what leaves
   * the last-persisted checkpoint behind for the next launch to find.
   */
  private fun teardownPlayback(clearCheckpoint: Boolean) {
    mainHandler.removeCallbacks(checkpointRunnable)
    if (clearCheckpoint) clearPersistedCheckpoint(applicationContext)
    renderThreadPaused.set(true)
    renderThreadRunning.set(false)
    renderThread?.let { thread ->
      try { thread.join(500) } catch (_: InterruptedException) { }
    }
    renderThread = null
    audioTrack?.let { track ->
      try { track.stop() } catch (_: IllegalStateException) { }
      track.release()
    }
    audioTrack = null
    activePrivateDeviceId = null
    ProceduralAudioEngine.reset()
    abandonAudioFocus()
    unregisterDeviceCallbackIfNeeded()
    updatePlaybackState(PlaybackStateCompat.STATE_STOPPED)
    playbackState = "stopped"
  }

  private fun preferredSampleRate(): Double {
    val native = AudioTrack.getNativeOutputSampleRate(AudioManager.STREAM_MUSIC)
    return if (native > 0) native.toDouble() else 48_000.0
  }

  private fun isPrivateOutput(device: AudioDeviceInfo): Boolean {
    return when (device.type) {
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_DEVICE -> true
      else -> false
    }
  }

  private fun refreshActivePrivateDevice() {
    val privateDevice = audioTrack?.routedDevice?.takeIf(::isPrivateOutput)
    activePrivateDeviceId = privateDevice?.id
    ProceduralAudioEngine.setPrivateOutput(privateDevice != null)
  }

  private fun resumeAfterRouteLoss() {
    if (pauseReason != PauseReason.ROUTE_LOSS) {
      routeLog("resume_skipped reason=$pauseReason")
      return
    }
    val privateDevice = preferredPrivateOutput()
    if (privateDevice == null) {
      routeLog("resume_waiting outputs=${describeDevices(audioManager?.getDevices(AudioManager.GET_DEVICES_OUTPUTS) ?: emptyArray())}")
      return
    }
    val preferredAccepted = audioTrack?.setPreferredDevice(privateDevice)
    routeLog("resume_attempt device=${describeDevice(privateDevice)} preferredAccepted=$preferredAccepted")
    activePrivateDeviceId = privateDevice.id
    ProceduralAudioEngine.setPrivateOutput(true)
    desiredPlaying = true
    play("route_recovered", gentleFadeIn = true)
  }

  /**
   * Route loss may only take ownership of a session that is currently playing.
   * In particular, it must never replace USER after a manual pause, since that
   * would make a later device connection look eligible for automatic resume.
   */
  private fun pauseForRouteLoss(source: String) {
    if (!isPlaying()) {
      routeLog("route_loss_ignored source=$source")
      return
    }
    routeLog("route_loss source=$source")
    ProceduralAudioEngine.recordDiagnostic("audio_route_changed", source, "speaker")
    pause(PauseReason.ROUTE_LOSS)
  }

  private fun hasPrivateOutput(): Boolean = audioManager
    ?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    ?.any(::isPrivateOutput) == true

  private fun preferredPrivateOutput(): AudioDeviceInfo? = audioManager
    ?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    ?.filter(::isPrivateOutput)
    ?.minByOrNull { device ->
      when (device.type) {
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> 0
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_USB_DEVICE -> 1
        else -> 2
      }
    }

  private fun routeLog(message: String) {
    Log.i(
      ROUTE_LOG_TAG,
      "$message state=$playbackState pauseReason=$pauseReason desired=$desiredPlaying playing=${isPlaying()} explicitAppPause=$explicitAppPause",
    )
  }

  private fun describeDevices(devices: Array<out AudioDeviceInfo>): String =
    devices.joinToString(prefix = "[", postfix = "]", transform = ::describeDevice)

  private fun describeDevice(device: AudioDeviceInfo): String =
    "${device.id}:${device.type}:${device.productName}"

  private fun registerNoisyReceiver() {
    if (noisyReceiverRegistered) return
    ContextCompat.registerReceiver(
      this,
      noisyReceiver,
      IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
    noisyReceiverRegistered = true
  }

  private fun unregisterNoisyReceiver() {
    if (!noisyReceiverRegistered) return
    unregisterReceiver(noisyReceiver)
    noisyReceiverRegistered = false
  }

  private fun rampTrackVolume() {
    for (step in 1..10) mainHandler.postDelayed({
      if (isPlaying()) audioTrack?.setVolume(step / 10f)
    }, step * 60L)
  }

  private fun buildAudioTrack(): AudioTrack {
    val sampleRate = ProceduralAudioEngine.sampleRate.toInt()
    val minBufferBytes = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_FLOAT)
    val bufferBytes = max(minBufferBytes * 3, sampleRate / 5 * 4 * 2)
    return AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
          .build()
      )
      .setBufferSizeInBytes(bufferBytes)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
  }

  private fun startRenderThread() {
    val track = audioTrack ?: return
    lastUnderrunCount = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) track.underrunCount else 0
    renderThreadRunning.set(true)
    renderThread = Thread({
      Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
      val buffer = FloatArray(RENDER_CHUNK_FRAMES * 2)
      while (renderThreadRunning.get()) {
        if (renderThreadPaused.get()) {
          try { Thread.sleep(20) } catch (_: InterruptedException) { }
          continue
        }
        // Phases only ever advance inside render(); pausing the call site (rather than
        // the AudioTrack alone) is what keeps phase state frozen across pause/resume.
        ProceduralAudioEngine.render(buffer, RENDER_CHUNK_FRAMES)
        val written = track.write(buffer, 0, buffer.size, AudioTrack.WRITE_BLOCKING)
        if (written < 0) {
          renderThreadRunning.set(false)
          renderThreadPaused.set(true)
          playbackState = "stopped"
          lastStopReason = "audio_track_write_failed"
          ProceduralAudioEngine.recordDiagnostic("playback_paused", "audio_track_write_failed")
          break
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          val underrunCount = track.underrunCount
          if (underrunCount > lastUnderrunCount) {
            lastUnderrunCount = underrunCount
            ProceduralAudioEngine.recordDiagnostic(
              "audio_underrun",
              extras = mapOf("underrunCount" to underrunCount),
            )
          }
        }
      }
    }, "InnerAudioRender").apply { start() }
  }

  private fun requestAudioFocus(): Boolean {
    val manager = audioManager ?: return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(attributes)
        .setOnAudioFocusChangeListener(focusChangeListener, mainHandler)
        .build()
      focusRequest = request
      return manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }
    @Suppress("DEPRECATION")
    val result = manager.requestAudioFocus(focusChangeListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun abandonAudioFocus() {
    val manager = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { manager.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(focusChangeListener)
    }
  }

  private fun registerDeviceCallbackIfNeeded() {
    if (deviceCallbackRegistered) return
    audioManager?.registerAudioDeviceCallback(deviceCallback, mainHandler)
    deviceCallbackRegistered = true
  }

  private fun unregisterDeviceCallbackIfNeeded() {
    if (!deviceCallbackRegistered) return
    audioManager?.unregisterAudioDeviceCallback(deviceCallback)
    deviceCallbackRegistered = false
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Inner playback", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Playback controls for Inner soundscapes"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun resolveSmallIconResId(): Int {
    val fromApp = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (fromApp != 0) fromApp else applicationInfo.icon
  }

  private fun buildNotification(isPlaying: Boolean): Notification {
    val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { launchIntent ->
      PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val playPauseAction = if (isPlaying) {
      NotificationCompat.Action(
        android.R.drawable.ic_media_pause,
        "Pause",
        MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PAUSE),
      )
    } else {
      NotificationCompat.Action(
        android.R.drawable.ic_media_play,
        "Play",
        MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PLAY),
      )
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(ProceduralAudioEngine.nowPlayingTitle)
      .setContentText("Inner")
      .setSmallIcon(resolveSmallIconResId())
      .setContentIntent(contentIntent)
      .setOnlyAlertOnce(true)
      .setOngoing(isPlaying)
      .addAction(playPauseAction)
      .setStyle(
        MediaStyle()
          .setMediaSession(mediaSession?.sessionToken)
          .setShowActionsInCompactView(0)
      )
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  private fun updatePlaybackState(state: Int) {
    val actions = PlaybackStateCompat.ACTION_PLAY or
      PlaybackStateCompat.ACTION_PAUSE or
      PlaybackStateCompat.ACTION_PLAY_PAUSE or
      PlaybackStateCompat.ACTION_STOP
    mediaSession?.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(actions)
        .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
        .build()
    )
  }

  private fun updateNowPlaying(isPlaying: Boolean) {
    mediaSession?.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, ProceduralAudioEngine.nowPlayingTitle)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Inner")
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Inner Soundscapes")
        .build()
    )
    updatePlaybackState(if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED)
    if (audioTrack != null) startForegroundCompat(buildNotification(isPlaying))
  }
}
