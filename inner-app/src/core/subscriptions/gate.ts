import { isLockedTrack, lockReason } from "./accessPolicy";
import { safePresentPaywall } from "./safePresentPaywall";

export async function gateOrRun(
  track: any,
  hasMembership: boolean,
  run: () => void | Promise<void>
) {
  if (isLockedTrack(track, hasMembership)) {
    await safePresentPaywall(); // crash-safe
    return;
  }
  await run();
}

export { lockReason };