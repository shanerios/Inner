package expo.modules.inneraudio

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class AudioConfigRecord : Record {
  @Field var carrierHz: Double = 528.0
  @Field var binauralCarrierHz: Double = 200.0
  @Field var binauralDeltaHz: Double = 4.0
  @Field var toneGain: Double = 0.22
  @Field var harmonicWarmth: Double = 0.0
  @Field var binauralGain: Double = 0.0
  @Field var noiseColor: String? = null
  @Field var noiseGain: Double = 0.0
  @Field var environment: String = "none"
  @Field var environmentGain: Double = 0.0
  @Field var environmentIntensity: Double = 0.5
  @Field var thresholdShift: Double = 0.0
  @Field var harmonicTranslation: Double = 0.0
  @Field var templeGain: Double = 0.0
  @Field var templeIntensity: Double = 0.5
  @Field var masterGain: Double = 0.8
  @Field var rampMs: Double = 80.0
  @Field var spatialMode: String = "still"
  @Field var spatialTarget: String = "noise"
  @Field var spatialDepth: Double = 0.0
  @Field var spatialRate: Double = 0.3
  @Field var identityPresence: Double = 1.0
  @Field var identityDensity: Double = 1.0
}

class SpatialEventRecord : Record {
  @Field var id: String = ""
  @Field var atMs: Double = 0.0
  @Field var type: String = "swoosh"
  @Field var direction: String = "right"
  @Field var durationMs: Double = 1_200.0
  @Field var depth: Double = 0.8
  @Field var recognitionSpace: Boolean = false
}

class TimelineStageRecord : Record {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var durationMs: Double = 1_000.0
  @Field var transitionMs: Double = 0.0
  @Field var config: AudioConfigRecord = AudioConfigRecord()
  @Field var spatialEvents: List<SpatialEventRecord> = emptyList()
}

class AudioTimelineRecord : Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var seed: Double = 1.0
  @Field var loop: Boolean = false
  @Field var fadeInMs: Double = 0.0
  @Field var totalDurationMs: Double = 0.0
  @Field var stages: List<TimelineStageRecord> = emptyList()
}
