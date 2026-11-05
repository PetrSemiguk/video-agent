// Camera presets: velocity continuity at joints, and plate alignment during a transition.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildShowreelTimeline, metas, SHOWREEL } from "../demo/showreelCamera";
import type { GeoCollection } from "../geo/geojson";
import { lonLatToPlatePx } from "../geo/plate";
import { plateView, projectToScreen } from "./plateProjection";
import { drift, establish, flyTo, focusOn, followLine, hold } from "./presets";
import { motion } from "../design/tokens";
import { peakMotion, screenMotion } from "../episode/camera";
import { cameraTimeline, fromMerc, metersPerPx, Timeline } from "./timeline";

const W = 1920;
const H = 1080;
const load = (p: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../data/processed/${p}`, import.meta.url),
      "utf8",
    ),
  ) as GeoCollection;

/**
 * Per-frame camera velocity: centre in screen px/frame (vector) and zoom in levels/frame.
 * Joint metric: a velocity *discontinuity* shows up as a non-zero second difference
 * |v[f] - 2 v[f-1] + v[f-2]| right at the joint (a smooth curve, even an accelerating one,
 * keeps it ~0). It is measured over the frames around every joint and reported relative to
 * the mean speed of the moving frames. Max speed / max acceleration are reported as well.
 */
const velocities = (tl: Timeline) => {
  const v: [number, number][] = [];
  const vz: number[] = [];
  for (let f = 0; f < tl.frames; f++) {
    const a = tl.poseAt(f);
    const b = tl.poseAt(f + 1);
    const mpp = metersPerPx((a.zoom + b.zoom) / 2);
    v.push([(b.x - a.x) / mpp, (b.y - a.y) / mpp]);
    vz.push(b.zoom - a.zoom);
  }
  return { v, vz };
};

const jointReport = (tl: Timeline) => {
  const { v, vz } = velocities(tl);
  const speed = v.map(([x, y]) => Math.hypot(x, y));
  const moving = speed.filter((x) => x > 0.01);
  const meanV = moving.reduce((s, x) => s + x, 0) / moving.length;
  const movingZ = vz.map(Math.abs).filter((x) => x > 1e-5);
  const meanZ = movingZ.reduce((s, x) => s + x, 0) / movingZ.length;
  let maxJumpV = 0;
  let maxJumpZ = 0;
  for (const b of tl.boundaries.slice(1)) {
    for (let f = b.start - 1; f <= b.start + 1; f++) {
      if (f < 2 || f >= v.length) continue;
      const jx = v[f][0] - 2 * v[f - 1][0] + v[f - 2][0];
      const jy = v[f][1] - 2 * v[f - 1][1] + v[f - 2][1];
      maxJumpV = Math.max(maxJumpV, Math.hypot(jx, jy) / meanV);
      maxJumpZ = Math.max(
        maxJumpZ,
        Math.abs(vz[f] - 2 * vz[f - 1] + vz[f - 2]) / meanZ,
      );
    }
  }
  const acc = v
    .slice(1)
    .map(([x, y], i) => Math.hypot(x - v[i][0], y - v[i][1]));
  return {
    maxSpeedPx: Math.max(...speed),
    maxAccelPx: Math.max(...acc),
    meanSpeedPx: meanV,
    maxJointJumpV: maxJumpV,
    maxJointJumpZoom: maxJumpZ,
  };
};

describe("preset joints are velocity-continuous", () => {
  test("all presets in sequence (china-east, Yellow River)", () => {
    const yellow = load("china-east-hs05/rivers/yellow.geojson");
    const f = yellow.features[0] as unknown as {
      geometry: { coordinates: [number, number][] };
      properties: { cumfrac: number[] };
    };
    const line = {
      points: f.geometry.coordinates,
      cumfrac: f.properties.cumfrac,
    };
    const drawStart = 300;
    const tl = cameraTimeline(
      [
        establish({ center: { lon: 110, lat: 32 }, zoom: 4.6 }, 90),
        flyTo({ center: { lon: 100, lat: 35 }, zoom: 5.1 }, 90),
        hold(30),
        flyTo({ center: { lon: 121, lat: 31 }, zoom: 5.2 }, 90), // far: van Wijk zoom-out
        followLine(
          line,
          (a) => Math.min(1, Math.max(0, (a - drawStart) / 240)),
          240,
          { zoom: 5.0 },
        ),
        drift(60),
        focusOn([105, 30, 115, 38], 60, { tilt: 8, maxZoom: 5.2 }),
      ],
      { fps: 30, width: W, height: H },
    );
    const r = jointReport(tl);
    console.log("presets:", JSON.stringify(r, null, 1));
    expect(r.maxJointJumpV).toBeLessThanOrEqual(0.1);
    expect(r.maxJointJumpZoom).toBeLessThanOrEqual(0.1);
    // hold() is strictly static
    const h = tl.boundaries.find((b) => b.name === "hold")!;
    expect(tl.poseAt(h.start + 10)).toEqual(tl.poseAt(h.start + 20));
  });

  test("showreel timeline", () => {
    const tl = buildShowreelTimeline({
      danube: load("central-europe/rivers/danube-vienna-belgrade.geojson"),
      alps: load("europe/custom/alps-che-aut.geojson"),
    });
    const r = jointReport(tl);
    console.log("showreel:", JSON.stringify(r, null, 1));
    expect(tl.frames).toBe(SHOWREEL.frames);
    expect(r.maxJointJumpV).toBeLessThanOrEqual(0.1);
    expect(r.maxJointJumpZoom).toBeLessThanOrEqual(0.1);
  });
});

describe("PlateSequence transition keeps plates aligned", () => {
  test("a city projected through plate A and plate B lands on the same pixel", () => {
    const tl = buildShowreelTimeline({
      danube: load("central-europe/rivers/danube-vienna-belgrade.geojson"),
      alps: load("europe/custom/alps-che-aut.geojson"),
    });
    const cities = [
      { lon: 16.3647, lat: 48.202 },
      { lon: 19.0814, lat: 47.502 },
      { lon: 14.42, lat: 50.09 },
    ];
    let maxD = 0;
    for (
      let f = SHOWREEL.transitionAt;
      f <= SHOWREEL.transitionAt + SHOWREEL.transitionFrames;
      f++
    ) {
      const cam = tl.path(metas.europe, f / SHOWREEL.fps, W, H);
      for (const c of cities) {
        const pts = [metas.europe, metas.central].map((m) => {
          const p = lonLatToPlatePx(m, c);
          return projectToScreen(plateView(m, cam), p.x, p.y, W, H);
        });
        maxD = Math.max(
          maxD,
          Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        );
      }
    }
    console.log(
      `transition: max distance between plates ${maxD.toExponential(2)} px`,
    );
    expect(maxD).toBeLessThanOrEqual(1);
  });
});

describe("showreel camera respects plate limits", () => {
  test("every frame: no visible plate edge, no magnification above the limit", async () => {
    const { verifyPlates } = await import("../map/PlateStage");
    const tl = buildShowreelTimeline({
      danube: load("central-europe/rivers/danube-vienna-belgrade.geojson"),
      alps: load("europe/custom/alps-che-aut.geojson"),
    });
    const report = verifyPlates(
      [metas.europe, metas.central],
      [{ at: SHOWREEL.transitionAt, frames: SHOWREEL.transitionFrames }],
      tl.path,
      SHOWREEL.frames,
      SHOWREEL.fps,
      W,
      H,
    );
    console.log("plate limits:", JSON.stringify(report));
  });
});

describe("speed limit of followLine", () => {
  const line = {
    points: [
      [100, 30],
      [125, 30],
    ] as [number, number][],
    cumfrac: [0, 1],
  };
  const timelineWith = (maxSpeed?: number) =>
    cameraTimeline(
      [
        establish({ center: { lon: 118, lat: 38 }, zoom: 5.4 }, 30),
        followLine(line, (f) => Math.max(0, (f - 30) / 300), 300, {
          zoom: 5.4,
          blend: 60,
          ...(maxSpeed ? { maxSpeed } : {}),
        }),
      ],
      { fps: 30, width: 1920, height: 1080 },
    );
  const peak = (maxSpeed?: number) => {
    const t = timelineWith(maxSpeed);
    let top = 0;
    for (let f = 31; f < 330; f++) {
      const [a, b] = [t.poseAt(f - 1), t.poseAt(f)];
      top = Math.max(
        top,
        Math.hypot(b.x - a.x, b.y - a.y) / metersPerPx(b.zoom),
      );
    }
    return top;
  };
  test("a far target at a fixed blend goes over the limit, the limited chase does not", () => {
    expect(peak()).toBeGreaterThan(motion.camera.maxSpeedPx);
    expect(peak(motion.camera.maxSpeedPx)).toBeLessThanOrEqual(
      motion.camera.maxSpeedPx + motion.camera.speedTolerancePx,
    );
  });
  test("a limited zoom keeps pan and zoom together within the limit at the corners", () => {
    const t = cameraTimeline(
      [
        establish({ center: { lon: 118, lat: 38 }, zoom: 4.9 }, 30),
        followLine(line, (f) => Math.max(0, (f - 30) / 300), 300, {
          zoom: 5.5,
          blend: 40,
          maxSpeed: motion.camera.maxSpeedPx,
        }),
      ],
      { fps: 30, width: 1920, height: 1080 },
    );
    expect(peakMotion(t.poseAt, 31, 298, 1920, 1080).speed).toBeLessThanOrEqual(
      motion.camera.maxSpeedPx + motion.camera.speedTolerancePx,
    );
    expect(t.poseAt(329).zoom).toBeCloseTo(5.5, 1);
  });
  test("a pure zoom moves the corners, and a pure pan moves everything alike", () => {
    const pose = { x: 0, y: 0, zoom: 5, pitch: 0, bearing: 0 };
    expect(screenMotion(pose, { ...pose, zoom: 5.01 }, 1920, 1080)).toBeCloseTo(
      Math.hypot(960, 540) * (2 ** 0.01 - 1),
      6,
    );
    const shift = 7 * metersPerPx(5);
    expect(screenMotion(pose, { ...pose, x: shift }, 1920, 1080)).toBeCloseTo(
      7,
      6,
    );
  });
  test("the limited camera still catches the line", () => {
    const t = timelineWith(motion.camera.maxSpeedPx);
    const end = fromMerc(t.poseAt(329).x, t.poseAt(329).y);
    expect(Math.abs(end.lat - 30)).toBeLessThan(0.5);
    expect(end.lon).toBeGreaterThan(115);
  });
});
