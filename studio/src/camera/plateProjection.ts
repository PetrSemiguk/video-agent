// CSS 3D placement of a flat plate (variant B) and its exact inverse.
//
// Element transform (applied to plate pixels right-to-left):
//   translate(W/2, H/2) rotateX(pitch) rotateZ(-bearing) scale(s) translate(-cx, -cy)
// with `perspective: P` and perspective-origin at the frame centre on the parent.
// A plate point ends at 3D (x, y, z) relative to the frame centre and is projected to
// screen (u, v) = (x, y) * P / (P - z). unprojectToPlate() inverts this exactly, so we can
// check on every frame that the frame corners land inside the plate (no visible edges)
// and that the plate is never magnified above 1:1.
import type { PlateMeta } from "../geo/plate";
import { CameraState } from "./flyover";
import { lonLatToPlatePx } from "../geo/plate";

export const PERSPECTIVE_PX = 2000;

export type PlateView = {
  /** Plate pixel at the frame centre. */
  cx: number;
  cy: number;
  /** Plate px → CSS px before perspective. */
  scale: number;
  pitchDeg: number;
  bearingDeg: number;
};

export const plateView = (meta: PlateMeta, cam: CameraState): PlateView => {
  const c = lonLatToPlatePx(meta, cam.center);
  return {
    cx: c.x,
    cy: c.y,
    scale: 2 ** (cam.zoom - meta.zoom.tile512),
    pitchDeg: cam.pitch,
    bearingDeg: cam.bearing,
  };
};

export const plateTransform = (
  view: PlateView,
  width: number,
  height: number,
) =>
  [
    `translate(${width / 2}px, ${height / 2}px)`,
    `rotateX(${view.pitchDeg}deg)`,
    `rotateZ(${-view.bearingDeg}deg)`,
    `scale(${view.scale})`,
    `translate(${-view.cx}px, ${-view.cy}px)`,
  ].join(" ");

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Screen point (frame px) → plate px. */
export const unprojectToPlate = (
  view: PlateView,
  sx: number,
  sy: number,
  width: number,
  height: number,
  P = PERSPECTIVE_PX,
): { x: number; y: number } => {
  const t = rad(view.pitchDeg);
  const phi = rad(-view.bearingDeg);
  const u = sx - width / 2;
  const v = sy - height / 2;
  const denom = P * Math.cos(t) + v * Math.sin(t);
  if (denom <= 0) {
    throw new Error("screen point is above the plate horizon");
  }
  const Y = (v * P) / denom;
  const z = Y * Math.sin(t);
  const X = (u * (P - z)) / P;
  // Undo rotateZ(phi): CSS rotateZ is x' = x cos - y sin, y' = x sin + y cos.
  const a = X * Math.cos(phi) + Y * Math.sin(phi);
  const b = -X * Math.sin(phi) + Y * Math.cos(phi);
  return { x: view.cx + a / view.scale, y: view.cy + b / view.scale };
};

export type CoverageReport = {
  /** Smallest distance (plate px) from a frame corner to the plate edge; must be > 0. */
  minMarginPx: number;
  /** Largest plate→screen magnification at the frame corners/centre; must be <= 1. */
  maxMagnification: number;
};

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);

export const coverage = (
  meta: PlateMeta,
  view: PlateView,
  width: number,
  height: number,
): CoverageReport => {
  const points: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
    [width / 2, height / 2],
  ];
  let minMarginPx = Infinity;
  let maxMagnification = 0;
  points.forEach(([sx, sy], i) => {
    const p = unprojectToPlate(view, sx, sy, width, height);
    if (i < 4) {
      minMarginPx = Math.min(
        minMarginPx,
        p.x,
        p.y,
        meta.width - p.x,
        meta.height - p.y,
      );
    }
    // 1 screen px step in x and y; magnification = screen px per plate px.
    const dx = dist(p, unprojectToPlate(view, sx + 1, sy, width, height));
    const dy = dist(p, unprojectToPlate(view, sx, sy + 1, width, height));
    maxMagnification = Math.max(maxMagnification, 1 / dx, 1 / dy);
  });
  return { minMarginPx, maxMagnification };
};
