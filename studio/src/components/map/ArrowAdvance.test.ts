import { describe, expect, test } from "vitest";
import { shaftEnd, tipDirection, totalLength } from "./ArrowAdvance";
import { arrowAdvanceSchema } from "./schemas";
import { measurePolyline } from "../../geo/line";
import { needsClaim } from "../../storyboard/claims";

const straight = measurePolyline([
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 200, y: 0 },
]);

describe("ArrowAdvance geometry", () => {
  test("a polyline is measured by length, not by vertex count", () => {
    const uneven = measurePolyline([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 110, y: 0 },
    ]);
    expect(uneven.cumfrac).toEqual([0, 10 / 110, 1]);
    expect(totalLength(uneven)).toBe(110);
    // All points equal: fall back to equal spacing rather than divide by zero.
    const degenerate = measurePolyline([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(degenerate.cumfrac).toEqual([0, 0.5, 1]);
  });
  test("the shaft stops short of the tip so the head is not drawn over it", () => {
    expect(shaftEnd(0.5, 0.1)).toBeCloseTo(0.4);
    // Early on, the head alone shows: the shaft cannot run backwards.
    expect(shaftEnd(0.05, 0.1)).toBe(0);
  });
  test("the head points along the path and sits at the progress point", () => {
    const tip = tipDirection(straight, 0.5);
    expect(tip.x).toBeCloseTo(100, 0);
    expect(tip.y).toBeCloseTo(0);
    expect(tip.angle).toBeCloseTo(0);
    const corner = measurePolyline([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]);
    expect(tipDirection(corner, 0.5).angle).toBeCloseTo(90);
  });
});

describe("ArrowAdvance contract", () => {
  const path: [number, number][] = [
    [30, 31],
    [33, 29],
  ];
  test("defaults mark an advance as conflict-coloured and solid", () => {
    const parsed = arrowAdvanceSchema.parse({ path });
    expect(parsed.color).toBe("conflict");
    expect(parsed.style).toBe("solid");
    expect(parsed.exitFrames).toBeGreaterThan(0);
  });
  test("a course needs at least two points, on the globe, and a short label", () => {
    expect(arrowAdvanceSchema.safeParse({ path: [[30, 31]] }).success).toBe(
      false,
    );
    expect(
      arrowAdvanceSchema.safeParse({ path: [[200, 31], [33, 29]] }).success,
    ).toBe(false);
    expect(
      arrowAdvanceSchema.safeParse({ path, label: "W".repeat(41) }).success,
    ).toBe(false);
    expect(
      arrowAdvanceSchema.safeParse({ path, drawFrames: 0 }).success,
    ).toBe(false);
  });
  test("an advance always states a fact, label or not", () => {
    expect(
      needsClaim({ id: "a", type: "ArrowAdvance", props: { path } }),
    ).toBe(true);
  });
});
