// toScreen() vs the CSS transform the browser applies, computed independently:
// the exact `transform` string from plateTransform() is parsed and composed as 4x4 matrices
// following CSS Transforms 2 (transform-origin 0 0, parent perspective with
// perspective-origin at the frame centre). The same check runs in real Chromium in the
// ProjectionCheck composition (getBoundingClientRect of probes in the geo layer).
import { describe, expect, test } from "vitest";
import { keyframedCamera } from "./keyframes";
import {
  PERSPECTIVE_PX,
  plateTransform,
  plateView,
  projectToScreen,
} from "./plateProjection";
import { lonLatToPlatePx, type PlateMeta } from "../geo/plate";
import meta from "../../public/plates/china-east-hs05.json";

type M = number[]; // column-major 4x4, like DOMMatrix / CSS

const identity = (): M => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a: M, b: M): M => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};
const translate = (x: number, y: number): M => {
  const m = identity();
  m[12] = x;
  m[13] = y;
  return m;
};
const scale = (s: number): M => {
  const m = identity();
  m[0] = s;
  m[5] = s;
  return m;
};
const rotateX = (deg: number): M => {
  const a = (deg * Math.PI) / 180;
  const m = identity();
  m[5] = Math.cos(a);
  m[6] = Math.sin(a);
  m[9] = -Math.sin(a);
  m[10] = Math.cos(a);
  return m;
};
const rotateZ = (deg: number): M => {
  const a = (deg * Math.PI) / 180;
  const m = identity();
  m[0] = Math.cos(a);
  m[1] = Math.sin(a);
  m[4] = -Math.sin(a);
  m[5] = Math.cos(a);
  return m;
};
const perspective = (d: number): M => {
  const m = identity();
  m[11] = -1 / d;
  return m;
};

/** Parse "translate(..px, ..px) rotateX(..deg) ..." into a matrix (left to right). */
const parseTransform = (css: string): M =>
  [...css.matchAll(/(\w+)\(([^)]*)\)/g)].reduce((acc, [, fn, args]) => {
    const v = args.split(",").map((s) => parseFloat(s));
    const step =
      fn === "translate"
        ? translate(v[0], v[1])
        : fn === "scale"
          ? scale(v[0])
          : fn === "rotateX"
            ? rotateX(v[0])
            : fn === "rotateZ"
              ? rotateZ(v[0])
              : null;
    if (!step) throw new Error(`unsupported transform ${fn}`);
    return mul(acc, step);
  }, identity());

const W = 1920;
const H = 1080;

/** Where the browser draws plate point (px, py): perspective(origin) * transform * point. */
const cssScreen = (transform: string, px: number, py: number) => {
  const persp = mul(
    mul(translate(W / 2, H / 2), perspective(PERSPECTIVE_PX)),
    translate(-W / 2, -H / 2),
  );
  const m = mul(persp, parseTransform(transform));
  const x = m[0] * px + m[4] * py + m[12];
  const y = m[1] * px + m[5] * py + m[13];
  const w = m[3] * px + m[7] * py + m[15];
  return { x: x / w, y: y / w };
};

const PROBES: [number, number][] = [
  [104.07, 30.67],
  [116.39, 39.9],
  [121.47, 31.23],
  [91.1, 29.65],
  [113.26, 23.13],
];

const camera = keyframedCamera([
  { t: 0, zoom: { cover: 0.25 } },
  {
    t: 3,
    center: { lon: 108, lat: 31.5 },
    zoom: { native: -0.4 },
    pitch: 18,
    bearing: 5,
  },
  {
    t: 6,
    center: { lon: 112, lat: 31 },
    zoom: { native: -0.35 },
    pitch: 25,
    bearing: -8,
  },
  { t: 10, zoom: { cover: 0.4 }, pitch: 8, bearing: 3 },
]);

describe("projectToScreen matches the CSS transform", () => {
  let maxErr = 0;
  const frames = Array.from({ length: 10 }, (_, i) => i * 30);
  test.each(frames)("frame %i", (frame) => {
    const m = meta as unknown as PlateMeta;
    const cam = camera(m, frame / 30, W, H);
    const view = plateView(m, cam);
    const transform = plateTransform(view, W, H);
    for (const [lon, lat] of PROBES) {
      const p = lonLatToPlatePx(m, { lon, lat });
      const ours = projectToScreen(view, p.x, p.y, W, H);
      const css = cssScreen(transform, p.x, p.y);
      const err = Math.hypot(ours.x - css.x, ours.y - css.y);
      maxErr = Math.max(maxErr, err);
      expect(err).toBeLessThanOrEqual(0.5);
    }
  });
  test("report", () => {
    console.log(
      `max toScreen error vs CSS matrix: ${maxErr.toExponential(2)} px`,
    );
    expect(maxErr).toBeLessThan(0.5);
  });
});
