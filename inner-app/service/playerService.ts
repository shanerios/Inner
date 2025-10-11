// service/playerService.ts
import TrackPlayer, { Event } from 'react-native-track-player';

export default async function playerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
  TrackPlayer.addEventListener(Event.RemoteDuck, (e) => {
    if (e.paused) TrackPlayer.pause();
  });
  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    try { await TrackPlayer.stop(); } catch {}
  });
}