import type { LonLat, PlateMeta } from "../geo/plate";

export type CameraState = {
  center: LonLat;
  /** Web-mercator zoom for 512 px tiles (MapLibre convention). */
  zoom: number;
  pitch: number;
  bearing: number;
};

/** A camera trajectory: camera state at any time (seconds) for a plate and frame size. */
export type CameraPath = (
  meta: PlateMeta,
  timeSec: number,
  width: number,
  height: number,
) => CameraState;
