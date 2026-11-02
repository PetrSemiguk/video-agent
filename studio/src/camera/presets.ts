// Camera presets: each returns a Segment of keys for cameraTimeline(). Deterministic.
// Zooms are absolute tile512 zooms (plate-independent), so one camera can drive several
// plates (PlateSequence). Use plateZoomLimits() to stay within a plate's sharp range.
import { motion, space } from "../design/tokens";
import type { GeoCollection } from "../geo/geojson";
import type { LonLat, PlateMeta } from "../geo/plate";
import {
  CamKey,
  CamPose,
  fromMerc,
  metersPerPx,
  Segment,
  toMerc,
  WORLD_M,
} from "./timeline";

export type Target = {
  center: LonLat;
  zoom: number;
  pitch?: number;
  bearing?: number;
};
export type Bounds = [number, number, number, number]; // minLon, minLat, maxLon, maxLat

const pose = (t: Target): CamPose => {
  const m = toMerc(t.center);
  return {
    x: m.x,
    y: m.y,
    zoom: t.zoom,
    pitch: t.pitch ?? 0,
    bearing: t.bearing ?? 0,
  };
};

/** Zoom range in which a plate stays sharp: cover (whole plate) .. max (≤ 1:1, oversampling). */
export const plateZoomLimits = (
  meta: PlateMeta,
  width: number,
  height: number,
) => {
  const native = meta.zoom.tile512;
  const cover =
    native - Math.log2(Math.min(meta.width / width, meta.height / height));
  const over = meta.resolution?.edge ?? 1;
  const maxMag = Math.min(1, 1 / over);
  return { cover, native, max: native + Math.log2(maxMag) };
};

export const boundsOf = (g: GeoCollection | Bounds): Bounds => {
  if (Array.isArray(g)) return g;
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (x: unknown): void => {
    if (Array.isArray(x) && typeof x[0] === "number") {
      const [lon, lat] = x as number[];
      a = Math.min(a, lon);
      b = Math.min(b, lat);
      c = Math.max(c, lon);
      d = Math.max(d, lat);
    } else if (Array.isArray(x)) x.forEach(visit);
  };
  g.features.forEach((f) => visit(f.geometry.coordinates));
  return [a, b, c, d];
};

/** Centre/zoom that fits bounds inside the safe area minus padding. */
export const fitBounds = (
  bounds: Bounds,
  width: number,
  height: number,
  padding: number = space.focusPadding,
): { center: LonLat; zoom: number } => {
  const p0 = toMerc({ lon: bounds[0], lat: bounds[1] });
  const p1 = toMerc({ lon: bounds[2], lat: bounds[3] });
  const availW = width * (1 - 2 * space.safeArea) - 2 * padding;
  const availH = height * (1 - 2 * space.safeArea) - 2 * padding;
  const mpp = Math.max((p1.x - p0.x) / availW, (p1.y - p0.y) / availH);
  return {
    center: fromMerc((p0.x + p1.x) / 2, (p0.y + p1.y) / 2),
    zoom: Math.log2(WORLD_M / (512 * mpp)),
  };
};

/** Opening shot: slow push-in of `push` (fraction of scale) with a light drift. */
export const establish = (
  target: Target,
  frames: number,
  opts: { push?: number; drift?: [number, number] } = {},
): Segment => ({
  name: "establish",
  frames,
  keys: (_start, ctx) => {
    const a = pose(target);
    const [dx, dy] = opts.drift ?? [0.012, -0.004]; // fraction of frame width
    const mpp = metersPerPx(a.zoom);
    return [
      { f: 0, ...a },
      {
        f: frames,
        ...a,
        x: a.x + dx * ctx.width * mpp,
        y: a.y - dy * ctx.width * mpp,
        zoom: a.zoom + Math.log2(1 + (opts.push ?? 0.08)),
      },
    ];
  },
});

/** Barely perceptible constant motion for "static" shots (the camera rarely stands still). */
export const drift = (
  frames: number,
  opts: { dir?: [number, number]; amount?: number; zoom?: number } = {},
): Segment => ({
  name: "drift",
  frames,
  keys: (s, ctx) => {
    const [ux, uy] = opts.dir ?? [1, 0];
    const len = Math.hypot(ux, uy) || 1;
    const d = (opts.amount ?? 0.015) * ctx.width * metersPerPx(s.zoom);
    return [
      {
        f: frames,
        ...s,
        x: s.x + (ux / len) * d,
        y: s.y - (uy / len) * d,
        zoom: s.zoom + (opts.zoom ?? 0.015),
      },
    ];
  },
});

/** Strictly static (QA, pauses). The camera decelerates into it with zero velocity. */
export const hold = (frames: number): Segment => ({
  name: "hold",
  frames,
  stillStart: true,
  keys: (s) => [{ f: frames, ...s, still: true }],
});

/** Fit an object (GeoJSON or bbox) into the safe area. */
export const focusOn = (
  target: GeoCollection | Bounds,
  frames: number,
  opts: {
    padding?: number;
    tilt?: number;
    bearing?: number;
    maxZoom?: number;
  } = {},
): Segment => ({
  name: "focusOn",
  frames,
  keys: (_s, ctx) => {
    const fit = fitBounds(
      boundsOf(target),
      ctx.width,
      ctx.height,
      opts.padding,
    );
    const zoom = Math.min(fit.zoom, opts.maxZoom ?? Infinity);
    return [
      {
        f: frames,
        ...pose({
          center: fit.center,
          zoom,
          pitch: opts.tilt,
          bearing: opts.bearing,
        }),
      },
    ];
  },
});

/**
 * Fly to a target. Far targets (more than `farFrames` frame widths away at the start zoom)
 * use the van Wijk & Nuij optimal path (as map flyTo does): the camera zooms out in the
 * middle in proportion to the distance, then back in. Near targets get a direct pan.
 */
export const flyTo = (
  to: Target,
  frames: number,
  opts: {
    from?: Target;
    rho?: number;
    farFrames?: number;
    samples?: number;
  } = {},
): Segment => ({
  name: "flyTo",
  frames,
  keys: (start, ctx) => {
    const a = opts.from ? pose(opts.from) : start;
    const b = pose(to);
    const rho = opts.rho ?? 1.42;
    const mpp0 = metersPerPx(a.zoom);
    const u1 = Math.hypot(b.x - a.x, b.y - a.y) / mpp0; // px at the start zoom
    const w0 = Math.max(ctx.width, ctx.height);
    const w1 = w0 / 2 ** (b.zoom - a.zoom);
    const lerpAngles = (k: number) => ({
      pitch: a.pitch + (b.pitch - a.pitch) * k,
      bearing: a.bearing + (b.bearing - a.bearing) * k,
    });
    const out: CamKey[] = [];
    if (opts.from) out.push({ f: 0, ...a });
    if (u1 < (opts.farFrames ?? 1.2) * ctx.width) {
      out.push({ f: frames, ...b });
      return out;
    }
    const r = (i: 0 | 1) => {
      const bb =
        (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho ** 4 * u1 * u1) /
        (2 * (i ? w1 : w0) * rho * rho * u1);
      return Math.log(Math.sqrt(bb * bb + 1) - bb);
    };
    const r0 = r(0);
    const S = (r(1) - r0) / rho;
    const n = opts.samples ?? Math.max(6, Math.round(frames / 6));
    for (let k = 1; k <= n; k++) {
      const q = motion.easing.inOut(k / n);
      const s = q * S;
      const w = Math.cosh(r0) / Math.cosh(r0 + rho * s);
      const u =
        (w0 *
          ((Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0)) /
            (rho * rho))) /
        u1;
      out.push({
        f: Math.round((k / n) * frames),
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        zoom: a.zoom + Math.log2(1 / w),
        ...lerpAngles(q),
      });
    }
    out[out.length - 1] = { f: frames, ...b };
    return out;
  },
});

export type MeasuredLonLatLine = {
  points: [number, number][];
  cumfrac: number[];
};

const pointAt = (line: MeasuredLonLatLine, f: number) => {
  const t = Math.min(1, Math.max(0, f));
  let i = 0;
  while (i < line.cumfrac.length - 2 && line.cumfrac[i + 1] < t) i++;
  const span = line.cumfrac[i + 1] - line.cumfrac[i] || 1;
  const k = (t - line.cumfrac[i]) / span;
  const [a, b] = [line.points[i], line.points[i + 1]];
  return toMerc({
    lon: a[0] + (b[0] - a[0]) * k,
    lat: a[1] + (b[1] - a[1]) * k,
  });
};

/**
 * Follow the head of a line being drawn (e.g. RiverLine). `progress(frame)` must be the same
 * function the drawing uses (absolute frames). The camera aims `lead` (length fraction) ahead
 * of the head as it was `lag` frames ago, averaged over ±`smooth` frames, so bends of the
 * river do not jerk the camera.
 */
export const followLine = (
  line: MeasuredLonLatLine,
  progress: (absFrame: number) => number,
  frames: number,
  opts: {
    lead?: number;
    lag?: number;
    smooth?: number;
    zoom?: number;
    every?: number;
    pitch?: number;
    /** Frames over which the camera eases from its start pose onto the line. */
    blend?: number;
  } = {},
): Segment => ({
  name: "followLine",
  frames,
  keys: (s, ctx) => {
    const lead = opts.lead ?? 0.04;
    const lag = opts.lag ?? 8;
    const smooth = opts.smooth ?? 24;
    const every = opts.every ?? 6;
    const aim = (abs: number) => {
      let x = 0;
      let y = 0;
      let n = 0;
      for (let d = -smooth; d <= smooth; d++) {
        const p = pointAt(line, progress(abs + d - lag) + lead);
        x += p.x;
        y += p.y;
        n++;
      }
      return { x: x / n, y: y / n };
    };
    const zoom = opts.zoom ?? s.zoom;
    const pitch = opts.pitch ?? s.pitch;
    const blend = opts.blend ?? 30;
    const key = (f: number): CamKey => {
      const c = aim(ctx.startFrame + f);
      const w = motion.easing.inOut(Math.min(1, f / blend));
      const mix = (a: number, b: number) => a + (b - a) * w;
      return {
        f,
        x: mix(s.x, c.x),
        y: mix(s.y, c.y),
        zoom: mix(s.zoom, zoom),
        pitch: mix(s.pitch, pitch),
        bearing: s.bearing,
      };
    };
    const out: CamKey[] = [];
    for (let f = every; f < frames; f += every) out.push(key(f));
    out.push(key(frames));
    return out;
  },
});
