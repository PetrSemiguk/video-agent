import { describe, expect, test } from "vitest";
import { space, textLayer } from "../../design/tokens";
import { lowerThirdSchema } from "./LowerThird";
import {
  autoCorner,
  boundsBox,
  CORNER_ORDER,
  cornerBox,
  lowerThirdSize,
  overlapArea,
  pickCorner,
  type Box,
} from "./placement";

const W = 1920;
const H = 1080;
const size = { width: 500, height: 150 };
const leftSide: Box = { left: 0, top: 0, right: 800, bottom: 1080 };
const rightSide: Box = { left: 1100, top: 0, right: 1920, bottom: 1080 };
const lowerHalf: Box = { left: 0, top: 540, right: 1920, bottom: 1080 };

describe("corner choice", () => {
  test("keeps the default corner when nothing is in the way", () => {
    expect(pickCorner([], size, W, H).corner).toBe("lower-left");
  });
  test("moves away from a subject and reports no overlap", () => {
    expect(pickCorner([leftSide], size, W, H)).toEqual({
      corner: "lower-right",
      overlap: 0,
    });
    expect(pickCorner([rightSide], size, W, H)).toEqual({
      corner: "lower-left",
      overlap: 0,
    });
    expect(pickCorner([lowerHalf], size, W, H)).toEqual({
      corner: "upper-left",
      overlap: 0,
    });
  });
  test("falls back to the least covering corner when none is clear", () => {
    const whole: Box = { left: 0, top: 0, right: W, bottom: 300 };
    const rest: Box = { left: 0, top: 700, right: 1000, bottom: H };
    const { corner, overlap } = pickCorner([whole, rest], size, W, H);
    expect(corner).toBe("lower-right");
    expect(overlap).toBe(0);
    const full: Box = { left: 0, top: 0, right: W, bottom: H };
    expect(pickCorner([full], size, W, H).overlap).toBeGreaterThan(0);
  });
  test("every corner stays inside the safe area and above the bottom 12%", () => {
    for (const corner of CORNER_ORDER) {
      const box = cornerBox(corner, size, W, H);
      expect(box.left).toBeGreaterThanOrEqual(W * space.safeArea);
      expect(box.right).toBeLessThanOrEqual(W * (1 - space.safeArea));
      expect(box.top).toBeGreaterThanOrEqual(H * space.safeArea);
      expect(box.bottom).toBeLessThanOrEqual(H * (1 - space.bottomReserve));
    }
  });
  test("the choice covers the subject over the card's whole life", () => {
    // The subject starts on the right, and the camera carries it to the left.
    const at = (frame: number) => (lonLat: [number, number]) => ({
      x: lonLat[0] - frame * 10,
      y: lonLat[1],
    });
    const bounds: [number, number, number, number] = [1300, 300, 1700, 900];
    const result = autoCorner(bounds, size, W, H, 0, 121, at);
    const final = boundsBox(bounds, at(120));
    expect(final.left).toBe(100);
    expect(result.corner).toBe("upper-left");
    expect(result.overlap).toBe(0);
    for (const box of result.subjects)
      expect(overlapArea(cornerBox(result.corner, size, W, H), box)).toBe(0);
  });
});

describe("content-sized card", () => {
  test("width follows the text between the token limits", () => {
    const short = lowerThirdSize("Yangtze");
    const long = lowerThirdSize("W".repeat(40), "W".repeat(60));
    expect(short.width).toBe(textLayer.fit.minWidth);
    expect(long.width).toBe(textLayer.fit.maxWidth);
    const middle = lowerThirdSize(
      "Reasons to unite",
      "An incentive, not a guarantee",
    );
    expect(middle.width).toBeGreaterThan(textLayer.fit.minWidth);
    expect(middle.width).toBeLessThan(textLayer.fit.maxWidth);
  });
  test("long text grows in height, not past the frame", () => {
    const one = lowerThirdSize("Title");
    const many = lowerThirdSize(
      "W".repeat(textLayer.limits.title),
      "W".repeat(textLayer.limits.subtitle),
    );
    expect(many.height).toBeGreaterThan(one.height);
    expect(many.height).toBeLessThan(600);
  });
  test('placement "auto" requires the subject bounds', () => {
    expect(
      lowerThirdSchema.safeParse({ title: "T", placement: "auto" }).success,
    ).toBe(false);
    expect(
      lowerThirdSchema.safeParse({
        title: "T",
        placement: "auto",
        subject: [100, 20, 110, 30],
      }).success,
    ).toBe(true);
  });
});
