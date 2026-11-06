// Polylines with a per-vertex cumulative length fraction (`cumfrac` from vap.geo.river).
type Pt = { x: number; y: number };

export type MeasuredLine<P> = { points: P[]; cumfrac: number[] };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Index i such that cumfrac[i] <= f < cumfrac[i + 1] (clamped). */
const segmentAt = (cumfrac: number[], f: number) => {
  let lo = 0;
  let hi = cumfrac.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumfrac[mid] <= f) lo = mid;
    else hi = mid;
  }
  return lo;
};

/** Point at a fraction of the total length (lon/lat or px, linear between vertices). */
export const pointAtFraction = (
  line: MeasuredLine<[number, number]>,
  f: number,
): [number, number] => {
  const t = Math.min(1, Math.max(0, f));
  const i = segmentAt(line.cumfrac, t);
  const [a, b] = [
    line.points[i],
    line.points[Math.min(i + 1, line.points.length - 1)],
  ];
  const span = line.cumfrac[i + 1] - line.cumfrac[i] || 1;
  const k = (t - line.cumfrac[i]) / span;
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
};

/** Sub-polyline between two length fractions (inclusive interpolated ends). */
export const sliceByFraction = (
  line: MeasuredLine<Pt>,
  f0: number,
  f1: number,
): Pt[] => {
  const a = Math.max(0, Math.min(1, f0));
  const b = Math.max(0, Math.min(1, f1));
  if (b <= a) {
    return [];
  }
  const at = (f: number): Pt => {
    const i = segmentAt(line.cumfrac, f);
    const p = line.points[i];
    const q = line.points[Math.min(i + 1, line.points.length - 1)];
    const span = line.cumfrac[i + 1] - line.cumfrac[i] || 1;
    const k = (f - line.cumfrac[i]) / span;
    return { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) };
  };
  const out: Pt[] = [at(a)];
  for (let i = 0; i < line.points.length; i++) {
    if (line.cumfrac[i] > a && line.cumfrac[i] < b) {
      out.push(line.points[i]);
    }
  }
  out.push(at(b));
  return out;
};

/**
 * Cumulative length fractions of a plain polyline, so it can be sliced like a sourced river or
 * route. Degenerate input (all points equal) falls back to equal spacing.
 */
export const measurePolyline = <P extends Pt>(points: P[]): MeasuredLine<P> => {
  const steps = points.map((p, i) =>
    i === 0 ? 0 : Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y),
  );
  const total = steps.reduce((a, b) => a + b, 0);
  let run = 0;
  const cumfrac = steps.map((step, i) => {
    run += step;
    return total > 0 ? run / total : i / Math.max(1, points.length - 1);
  });
  cumfrac[cumfrac.length - 1] = 1;
  return { points, cumfrac };
};

export const polylineD = (pts: Pt[]) =>
  pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join("");
