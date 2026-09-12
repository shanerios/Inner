package expo.modules.inneraudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
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
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media.session.MediaButtonReceiver
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

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

    @Volatile var isRunning = false
      private set

    @Volatile var playbackState = "stopped"
      private set

    fun playIntent(context: Context): Intent = Intent(context, InnerAudioPlaybackService::class.java).setAction(ACTION_PLAY)
    fun pauseIntent(context: Context): Intent = Intent(context, InnerAudioPlaybackService::class.java).setAction(ACTION_PAUSE)
    fun stopIntent(context: Context): Intent = Intent(context, InnerAudioPlaybackService::class.java).setAction(ACTION_STOP)
    fun refreshNowPlayingIntent(context: Context): Intent =
      Intent(context, InnerAudioPlaybackService::class.java).setAction(ACTION_REFRESH_NOW_PLAYING)
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
  private var activePrivateDeviceId: Int? = null

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      val addedPrivateOutput = addedDevices.any(::isPrivateOutput)
      ProceduralAudioEngine.recordDiagnostic("audio_route_changed", "device_added", if (addedPrivateOutput) "private" else "speaker")
      if (addedPrivateOutput && pauseReason == PauseReason.ROUTE_LOSS) {
        mainHandler.postDelayed(::resumeAfterRouteLoss, 500L)
        mainHandler.postDelayed(::resumeAfterRouteLoss, 1_500L)
        return
      }
      mainHandler.postDelayed({ if (isPlaying()) refreshActivePrivateDevice() }, 350L)
      mainHandler.postDelayed({ if (isPlaying()) refreshActivePrivateDevice() }, 1_500L)
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      val activeId = activePrivateDeviceId ?: return
      if (removedDevices.any { it.id == activeId }) {
        ProceduralAudioEngine.recordDiagnostic("audio_route_changed", "private_device_removed", "speaker")
        desiredPlaying = false
        pause(PauseReason.ROUTE_LOSS)
      }
    }
  }

  private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
    when (focusChange) {
      AudioManager.AUDIOFOCUS_LOSS -> {
        ProceduralAudioEngine.recordDiagnostic("interruption_began", "focus_loss")
        desiredPlaying = false
        pause(PauseReason.INTERRUPTION)
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        ProceduralAudioEngine.recordDiagnostic("interruption_began", "focus_loss_transient")
        pause(PauseReason.INTERRUPTION)
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
    ProceduralAudioEngine.onSleepTimerElapsed = { mainHandler.post { stop() } }
    mediaSession = MediaSessionCompat(this, "InnerAudio").apply {
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          desiredPlaying = true
          play("media_control")
        }
        override fun onPause() {
          desiredPlaying = false
          pause(PauseReason.USER)
        }
        override fun onStop() = stop()
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
        desiredPlaying = false
        pause(PauseReason.USER)
      }
      ACTION_STOP -> stop()
      ACTION_REFRESH_NOW_PLAYING -> updateNowPlaying(isPlaying())
      else -> mediaSession?.let { MediaButtonReceiver.handleIntent(it, intent) }
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    teardownPlayback()
    mediaSession?.release()
    mediaSession = null
    ProceduralAudioEngine.onSleepTimerElapsed = null
    isRunning = false
    super.onDestroy()
  }

  private fun isPlaying() = renderThreadRunning.get() && !renderThreadPaused.get()

  private fun play(reason: String, gentleFadeIn: Boolean = false) {
    if (!requestAudioFocus()) return
    if (audioTrack == null) {
      ProceduralAudioEngine.sampleRate = preferredSampleRate()
      audioTrack = buildAudioTrack()
      startRenderThread()
    }
    pauseReason = null
    if (gentleFadeIn) audioTrack?.setVolume(0f) else audioTrack?.setVolume(1f)
    audioTrack?.play()
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
  }

  private fun pause(reason: PauseReason) {
    pauseReason = reason
    renderThreadPaused.set(true)
    audioTrack?.pause()
    playbackState = if (audioTrack == null) "stopped" else "paused"
    updateNowPlaying(isPlaying = false)
    ProceduralAudioEngine.recordDiagnostic("playback_paused", when (reason) {
      PauseReason.USER -> "user_pause"
      PauseReason.ROUTE_LOSS -> "route_loss"
      PauseReason.INTERRUPTION -> "interruption"
    })
  }

  private fun stop() {
    desiredPlaying = false
    pauseReason = null
    teardownPlayback()
    mediaSession?.isActive = false
    stopForegroundCompat()
    stopSelf()
  }

  /** Idempotent — safe to call from both stop() and onDestroy(). */
  private fun teardownPlayback() {
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
    if (pauseReason != PauseReason.ROUTE_LOSS) return
    val privateDevice = audioManager
      ?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      ?.firstOrNull(::isPrivateOutput)
      ?: return
    audioTrack?.preferredDevice = privateDevice
    activePrivateDeviceId = privateDevice.id
    ProceduralAudioEngine.setPrivateOutput(true)
    desiredPlaying = true
    play("route_recovered", gentleFadeIn = true)
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
