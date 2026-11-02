// Keyframed camera paths for PlateStage. Zoom can be given relative to the plate:
// { cover: d } = d zoom levels above "whole plate fills the frame",
// { native: d } = d levels relative to 1 plate px = 1 frame px (use negative values),
// or as an absolute number. Centre is interpolated in Web Mercator metres.
import { interpolate } from "remotion";
import { motion } from "../design/tokens";
import type { LonLat, PlateMeta } from "../geo/plate";
import type { CameraPath, CameraState } from "./types";

export type ZoomSpec = number | { cover: number } | { native: number };

export type CameraKey = {
  /** Time in seconds. */
  t: number;
  /** Defaults to the plate centre. */
  center?: LonLat;
  zoom: ZoomSpec;
  pitch?: number;
  bearing?: number;
  /** Easing of the segment that ENDS at this key (default: motion.easing.inOut). */
  ease?: (x: number) => number;
};

const R = 6378137;
const toMerc = ({ lon, lat }: LonLat) => ({
  x: (R * lon * Math.PI) / 180,
  y: R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
});
const fromMerc = (x: number, y: number): LonLat => ({
  lon: ((x / R) * 180) / Math.PI,
  lat: ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI,
});

export const plateZooms = (
  meta: PlateMeta,
  frameWidth: number,
  frameHeight: number,
) => {
  // At zoom `native` one plate pixel is one CSS pixel of the frame.
  const native = meta.zoom.tile512;
  const cover =
    native -
    Math.log2(Math.min(meta.width / frameWidth, meta.height / frameHeight));
  return { native, cover };
};

export const plateCenter = (meta: PlateMeta): LonLat => {
  const [minX, minY, maxX, maxY] = meta.bbox_3857;
  return fromMerc((minX + maxX) / 2, (minY + maxY) / 2);
};

const resolveZoom = (z: ZoomSpec, zooms: { native: number; cover: number }) =>
  typeof z === "number"
    ? z
    : "cover" in z
      ? zooms.cover + z.cover
      : zooms.native + z.native;

export const keyframedCamera = (keys: CameraKey[]): CameraPath => {
  if (keys.length === 0) {
    throw new Error("camera needs at least one key");
  }
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  return (meta, timeSec, width, height): CameraState => {
    const zooms = plateZooms(meta, width, height);
    const state = (k: CameraKey) => ({
      center: toMerc(k.center ?? plateCenter(meta)),
      zoom: resolveZoom(k.zoom, zooms),
      pitch: k.pitch ?? 0,
      bearing: k.bearing ?? 0,
    });
    let i = sorted.findIndex((k) => k.t > timeSec);
    if (i === -1) i = sorted.length; // after the last key: hold
    const a = state(sorted[Math.max(0, i - 1)]);
    const bKey = sorted[Math.min(i, sorted.length - 1)];
    const b = state(bKey);
    const aT = sorted[Math.max(0, i - 1)].t;
    const p =
      i === 0 || i === sorted.length || bKey.t === aT
        ? i === 0
          ? 0
          : 1
        : interpolate(timeSec, [aT, bKey.t], [0, 1], {
            easing: bKey.ease ?? motion.easing.inOut,
          });
    const lerp = (x: number, y: number) => x + (y - x) * p;
    return {
      center: fromMerc(
        lerp(a.center.x, b.center.x),
        lerp(a.center.y, b.center.y),
      ),
      zoom: lerp(a.zoom, b.zoom),
      pitch: lerp(a.pitch, b.pitch),
      bearing: lerp(a.bearing, b.bearing),
    };
  };
};
