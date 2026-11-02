// Camera timeline: presets emit keys; one C1 spline runs through all of them.
//
// Channels: centre x/y in Web Mercator metres, zoom (tile512, i.e. log2 of scale), pitch,
// bearing. Each channel is a C2 cubic spline through all keys (splineSlopes):
// - velocity and acceleration are continuous at every key, including the joints between
//   presets, so there are no jerks where one preset hands over to the next;
// - keys flagged `still` get zero velocity: hold() is exactly static and the camera
//   decelerates into it smoothly;
// - a spline can overshoot between keys; PlateStage/PlateSequence verify every frame
//   (edges, magnification), so an overshoot fails the render instead of shipping.
import type { LonLat } from "../geo/plate";
import type { CameraPath, CameraState } from "./types";

export const R = 6378137;
export const WORLD_M = 2 * Math.PI * R;

export const toMerc = ({ lon, lat }: LonLat) => ({
  x: (R * lon * Math.PI) / 180,
  y: R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
});
export const fromMerc = (x: number, y: number): LonLat => ({
  lon: ((x / R) * 180) / Math.PI,
  lat: ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI,
});
/** Mercator metres per CSS pixel at a tile512 zoom. */
export const metersPerPx = (zoom: number) => WORLD_M / (512 * 2 ** zoom);

export type CamKey = {
  /** Frame (absolute once in the timeline). */
  f: number;
  x: number;
  y: number;
  zoom: number;
  pitch: number;
  bearing: number;
  /** Zero velocity at this key. */
  still?: boolean;
};

export type CamPose = Omit<CamKey, "f" | "still">;

export type SegmentContext = {
  fps: number;
  width: number;
  height: number;
  /** Absolute frame where the segment starts. */
  startFrame: number;
};

export type Segment = {
  name: string;
  frames: number;
  /** Keys relative to the segment start (f in 0..frames). f = 0 is only used by the first
   * segment (it sets the opening pose); later segments start where the previous one ended. */
  keys: (
    start: CamPose,
    ctx: SegmentContext,
  ) => Omit<CamKey, "still">[] | CamKey[];
  /** The joint key at the start of this segment gets zero velocity (hold). */
  stillStart?: boolean;
};

const CHANNELS = ["x", "y", "zoom", "pitch", "bearing"] as const;
type Channel = (typeof CHANNELS)[number];

/**
 * Key slopes of a C2 cubic spline (continuous velocity AND acceleration) for non-uniform t.
 * The keys are split into runs at `still` keys: there the slope is clamped to 0 (holds are
 * exactly static); other run ends are natural (zero second derivative). Solved per run with
 * the tridiagonal C2 conditions h_i m_{i-1} + 2(h_{i-1}+h_i) m_i + h_{i-1} m_{i+1} =
 * 3(h_i d_{i-1} + h_{i-1} d_i).
 */
const splineSlopes = (t: number[], v: number[], still: boolean[]): number[] => {
  const n = t.length;
  const m = new Array(n).fill(0);
  if (n < 2) return m;
  const d = Array.from(
    { length: n - 1 },
    (_, i) => (v[i + 1] - v[i]) / (t[i + 1] - t[i]),
  );
  let start = 0;
  while (start < n - 1) {
    let end = start + 1;
    while (end < n - 1 && !still[end]) end++;
    // Unknowns: slopes start..end (clamped ends are fixed at 0).
    const k = end - start + 1;
    const A = new Array(k).fill(0);
    const B = new Array(k).fill(0);
    const C = new Array(k).fill(0);
    const D = new Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      const i = start + j;
      if ((j === 0 && still[i]) || (j === k - 1 && still[i])) {
        B[j] = 1; // m_i = 0
      } else if (j === 0) {
        B[j] = 2;
        C[j] = 1;
        D[j] = 3 * d[i];
      } else if (j === k - 1) {
        A[j] = 1;
        B[j] = 2;
        D[j] = 3 * d[i - 1];
      } else {
        const h0 = t[i] - t[i - 1];
        const h1 = t[i + 1] - t[i];
        A[j] = h1;
        B[j] = 2 * (h0 + h1);
        C[j] = h0;
        D[j] = 3 * (h1 * d[i - 1] + h0 * d[i]);
      }
    }
    // Thomas algorithm.
    for (let j = 1; j < k; j++) {
      const w = A[j] / B[j - 1];
      B[j] -= w * C[j - 1];
      D[j] -= w * D[j - 1];
    }
    const x = new Array(k).fill(0);
    x[k - 1] = D[k - 1] / B[k - 1];
    for (let j = k - 2; j >= 0; j--) x[j] = (D[j] - C[j] * x[j + 1]) / B[j];
    for (let j = 0; j < k; j++) m[start + j] = x[j];
    start = end;
  }
  return m;
};

export type Timeline = {
  path: CameraPath;
  keys: CamKey[];
  /** Absolute start frame of every segment, plus the total length at the end. */
  boundaries: { name: string; start: number }[];
  frames: number;
  /** Camera pose at a (fractional) frame. */
  poseAt: (frame: number) => CamPose;
};

export const cameraTimeline = (
  segments: Segment[],
  opts: { fps: number; width: number; height: number },
): Timeline => {
  if (segments.length === 0) throw new Error("empty camera timeline");
  const keys: CamKey[] = [];
  const boundaries: { name: string; start: number }[] = [];
  let start = 0;
  let pose: CamPose | null = null;
  for (const seg of segments) {
    boundaries.push({ name: seg.name, start });
    const ctx = { ...opts, startFrame: start };
    const emitted = seg.keys(
      pose ?? { x: 0, y: 0, zoom: 0, pitch: 0, bearing: 0 },
      ctx,
    );
    if (pose === null) {
      const first = emitted.find((k) => k.f === 0);
      if (!first)
        throw new Error(`first segment "${seg.name}" must emit a key at f = 0`);
    }
    if (seg.stillStart && keys.length) keys[keys.length - 1].still = true;
    for (const k of emitted) {
      if (k.f === 0 && pose !== null) continue;
      keys.push({ ...k, f: start + k.f });
    }
    const last = keys[keys.length - 1];
    pose = {
      x: last.x,
      y: last.y,
      zoom: last.zoom,
      pitch: last.pitch,
      bearing: last.bearing,
    };
    start += seg.frames;
  }
  keys.sort((a, b) => a.f - b.f);
  const t = keys.map((k) => k.f);
  const still = keys.map((k) => !!k.still);
  const tangents = Object.fromEntries(
    CHANNELS.map((c) => [
      c,
      splineSlopes(
        t,
        keys.map((k) => k[c]),
        still,
      ),
    ]),
  ) as Record<Channel, number[]>;

  const poseAt = (frame: number): CamPose => {
    if (frame <= t[0]) return { ...keys[0] };
    if (frame >= t[t.length - 1]) return { ...keys[keys.length - 1] };
    let i = 0;
    while (t[i + 1] < frame) i++;
    const h = t[i + 1] - t[i];
    const s = (frame - t[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const out = {} as CamPose;
    for (const c of CHANNELS) {
      const m = tangents[c];
      out[c] =
        // a + (b - a)·h01 + slope terms: exact when a = b and both slopes are 0 (hold).
        keys[i][c] +
        (keys[i + 1][c] - keys[i][c]) * h01 +
        h10 * h * m[i] +
        h11 * h * m[i + 1];
    }
    return out;
  };

  const path: CameraPath = (_meta, timeSec): CameraState => {
    const p = poseAt(timeSec * opts.fps);
    return {
      center: fromMerc(p.x, p.y),
      zoom: p.zoom,
      pitch: p.pitch,
      bearing: p.bearing,
    };
  };
  return { path, keys, boundaries, frames: start, poseAt };
};
