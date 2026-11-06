import { describe, expect, test } from "vitest";
import { heldBar, heldOpacity, retreatSpans } from "./ArrowRetreat";
import { arrowRetreatSchema } from "./schemas";
import { measurePolyline } from "../../geo/line";
import { retreatArrow } from "../../design/tokens";
import { needsClaim } from "../../storyboard/claims";

const straight = measurePolyline([
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 200, y: 0 },
]);

describe("ArrowRetreat geometry", () => {
  test("the shaft collapses onto a head that never moves off the line fallen back to", () => {
    const head = 0.2;
    const start = retreatSpans(0, head);
    // Whole from the first frame: nothing grows forwards, so it cannot read as an advance.
    expect(start.shaft).toEqual({ from: 0, to: 0.8 });
    expect(start.vacated).toEqual({ from: 0, to: 0 });
    const half = retreatSpans(0.5, head);
    expect(half.shaft.from).toBeCloseTo(0.5);
    expect(half.shaft.to).toBeCloseTo(0.8);
    // Once the force is back, the shaft is empty and only the head and the trace remain.
    const done = retreatSpans(1, head);
    expect(done.shaft.from).toBe(done.shaft.to);
    expect(done.vacated.to).toBe(1);
    // The shaft's end never depends on progress: the head stays put.
    for (const p of [0, 0.3, 0.9, 1])
      expect(retreatSpans(p, head).shaft.to).toBe(0.8);
  });
  test("the span stays inside the course for out-of-range progress and a huge head", () => {
    expect(retreatSpans(-1, 0.2).shaft).toEqual({ from: 0, to: 0.8 });
    expect(retreatSpans(2, 0.2).vacated.to).toBe(1);
    expect(retreatSpans(0.5, 1.4).shaft).toEqual({ from: 0, to: 0 });
  });
  test("the ground let go grows while the part still held shrinks", () => {
    const widths = [0, 0.25, 0.5, 0.75].map((p) => {
      const { vacated, shaft } = retreatSpans(p, 0.2);
      return [vacated.to - vacated.from, shaft.to - shaft.from];
    });
    widths.forEach(([given, held], i) => {
      if (i === 0) return;
      expect(given).toBeGreaterThan(widths[i - 1][0]);
      expect(held).toBeLessThan(widths[i - 1][1]);
    });
  });
  test("the line held is released early, so the ground is visibly given up", () => {
    expect(heldOpacity(0)).toBe(1);
    expect(heldOpacity(retreatArrow.held.releaseFraction)).toBe(0);
    expect(heldOpacity(0.5)).toBe(0);
    expect(heldOpacity(-1)).toBe(1);
    expect(heldOpacity(retreatArrow.held.releaseFraction / 2)).toBeCloseTo(0.5);
  });
  test("the line held is a bar across the course at the point left first", () => {
    const bar = heldBar(straight, 100);
    expect([bar.x1, bar.x2]).toEqual([0, 0]);
    expect(bar.y1).toBeCloseTo(-50);
    expect(bar.y2).toBeCloseTo(50);
    const southward = heldBar(
      measurePolyline([
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ]),
      100,
    );
    expect(southward.x1).toBeCloseTo(50);
    expect(southward.x2).toBeCloseTo(-50);
    expect([southward.y1, southward.y2]).toEqual([0, 0]);
    // A course of one repeated point has no direction; the bar must stay finite.
    const degenerate = heldBar(
      measurePolyline([
        { x: 7, y: 7 },
        { x: 7, y: 7 },
      ]),
      100,
    );
    for (const n of Object.values(degenerate))
      expect(Number.isFinite(n)).toBe(true);
  });
});

describe("ArrowRetreat contract", () => {
  const path: [number, number][] = [
    [16, 48],
    [8, 50],
  ];
  test("defaults mark a withdrawal as conflict-coloured, solid and fading out", () => {
    const parsed = arrowRetreatSchema.parse({ path });
    expect(parsed.color).toBe("conflict");
    expect(parsed.style).toBe("solid");
    expect(parsed.drawFrames).toBeGreaterThan(0);
    expect(parsed.exitFrames).toBeGreaterThan(0);
  });
  test("a course needs at least two points, on the globe, and a short label", () => {
    expect(arrowRetreatSchema.safeParse({ path: [[16, 48]] }).success).toBe(
      false,
    );
    expect(
      arrowRetreatSchema.safeParse({
        path: [
          [16, 95],
          [8, 50],
        ],
      }).success,
    ).toBe(false);
    expect(
      arrowRetreatSchema.safeParse({ path, label: "W".repeat(41) }).success,
    ).toBe(false);
    expect(arrowRetreatSchema.safeParse({ path, label: "" }).success).toBe(
      false,
    );
    expect(arrowRetreatSchema.safeParse({ path, drawFrames: 0 }).success).toBe(
      false,
    );
    expect(arrowRetreatSchema.safeParse({ path, exitFrames: -1 }).success).toBe(
      false,
    );
    // No prop invents the ground lost: a region is RegionHighlight's business.
    expect(
      arrowRetreatSchema.safeParse({ path, lost: { type: "Polygon" } }).success,
    ).toBe(false);
  });
  test("a withdrawal always states a fact, label or not", () => {
    expect(needsClaim({ id: "r", type: "ArrowRetreat", props: { path } })).toBe(
      true,
    );
  });
});
