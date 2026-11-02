// Shared camera trajectory for the step 1.2 A/B test (MapLibre 3D vs plate + CSS).
// All keyframes live here; both variants call flyoverCamera() for every frame.
import { Easing, interpolate } from "remotion";
import type { LonLat, PlateMeta } from "../geo/plate";

export const FLYOVER_PLATE = "china-east-hs05";
export const FLYOVER_FPS = 30;
export const FLYOVER_SECONDS = 12;
export const FLYOVER_FRAMES = FLYOVER_FPS * FLYOVER_SECONDS;

/** Chengdu: overlay marker that must stay glued to the map. */
export const CHENGDU: LonLat = { lon: 104.07, lat: 30.67 };

/** Sichuan Basin / Qinling: where the flight ends. */
const TARGET: LonLat = { lon: 106.0, lat: 31.8 };

/** Segment boundaries in seconds: overview push, flight, hold (camera fully static). */
const T = { start: 0, flightStart: 2, flightEnd: 9, end: FLYOVER_SECONDS };

/** Flight easing: CSS "ease" starts with a non-zero slope, so the 0–2 s push flows into it. */
const FLIGHT_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

/**
 * Zoom keys relative to the plate: `cover` shows the whole plate in a 16:9 frame,
 * `native` is the plate's own resolution (1 plate px = 1 frame px).
 * The end zoom stays 0.2 below native so that B's pseudo-tilt never magnifies the
 * plate above 1:1 (at 25° the perspective enlarges the near edge by up to ~15 %, so
 * 2^-0.25 * 1.15 < 1). AbPlate verifies this on every frame.
 */
const ZOOM = { start: 0.03, pushEnd: 0.15, endBelowNative: 0.25 };

export type TiltProfile = { pitchEnd: number; bearingEnd: number };

/** A tilts for real (MapLibre terrain); B fakes it with CSS rotateX/rotateZ. */
export const TILT: Record<"maplibre" | "plate", TiltProfile> = {
  maplibre: { pitchEnd: 50, bearingEnd: 15 },
  plate: { pitchEnd: 25, bearingEnd: 5 },
};

export type CameraState = {
  center: LonLat;
  /** Web-mercator zoom for 512 px tiles (MapLibre convention). */
  zoom: number;
  pitch: number;
  bearing: number;
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

const plateCenter = (meta: PlateMeta): LonLat => {
  const [minX, minY, maxX, maxY] = meta.bbox_3857;
  return fromMerc((minX + maxX) / 2, (minY + maxY) / 2);
};

/** Progress of the flight segment, 0 before 2 s and 1 after 9 s. */
const flightProgress = (t: number) =>
  interpolate(t, [T.flightStart, T.flightEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: FLIGHT_EASING,
  });

export const flyoverCamera = (
  meta: PlateMeta,
  timeSec: number,
  tilt: TiltProfile,
  frameWidth: number,
  frameHeight: number,
): CameraState => {
  const { native, cover } = plateZooms(meta, frameWidth, frameHeight);
  const zStart = cover + ZOOM.start;
  const zPush = cover + ZOOM.pushEnd;
  const zEnd = native - ZOOM.endBelowNative;
  const p = flightProgress(timeSec);

  const zoom =
    timeSec < T.flightStart
      ? interpolate(timeSec, [T.start, T.flightStart], [zStart, zPush], {
          extrapolateLeft: "clamp",
        })
      : zPush + (zEnd - zPush) * p;

  const a = toMerc(plateCenter(meta));
  const b = toMerc(TARGET);
  const center = fromMerc(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);

  return {
    center,
    zoom,
    pitch: tilt.pitchEnd * p,
    bearing: tilt.bearingEnd * p,
  };
};
