// Choosing a corner for a card so it does not cover the shot's subject. Pure, so the choice is
// the same on every frame and can be tested without a browser.
import { space, textLayer, type as typeTokens } from "../../design/tokens";

export type Box = { left: number; top: number; right: number; bottom: number };
export type Corner =
  | "lower-left"
  | "lower-right"
  | "upper-left"
  | "upper-right";
export type Size = { width: number; height: number };

export const CORNER_ORDER: Corner[] = [
  "lower-left",
  "lower-right",
  "upper-left",
  "upper-right",
];

/** Screen box of a card at a corner, matching TextFrame's positions. */
export const cornerBox = (
  corner: Corner,
  size: Size,
  W: number,
  H: number,
): Box => {
  const left = corner.endsWith("left")
    ? W * space.safeArea
    : W * (1 - space.safeArea) - size.width;
  const top = corner.startsWith("upper")
    ? H * space.safeArea
    : H * (1 - space.bottomReserve) - space.enterShift - size.height;
  return { left, top, right: left + size.width, bottom: top + size.height };
};

export const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

const grown = (box: Box, by: number): Box => ({
  left: box.left - by,
  top: box.top - by,
  right: box.right + by,
  bottom: box.bottom + by,
});

/** The first corner clear of every subject box; if none is clear, the least covering one. */
export const pickCorner = (
  subjects: Box[],
  size: Size,
  W: number,
  H: number,
): { corner: Corner; overlap: number } => {
  const scored = CORNER_ORDER.map((corner) => ({
    corner,
    overlap: subjects.reduce(
      (sum, s) =>
        sum +
        overlapArea(
          cornerBox(corner, size, W, H),
          grown(s, textLayer.fit.clearance),
        ),
      0,
    ),
  }));
  return scored.reduce((best, s) => (s.overlap < best.overlap ? s : best));
};

const wrappedLines = (chars: number, glyph: number, inner: number) =>
  Math.max(1, Math.ceil((chars * glyph) / inner));

/**
 * Upper bound of a LowerThird's size before layout. Layout is not available when placing a card,
 * and a font loading late must not move it, so glyph widths are bounds and not measurements.
 */
export const lowerThirdSize = (title: string, subtitle?: string): Size => {
  const { fit, padding, bar, titleSize, bodySize, gap } = textLayer;
  const inner = fit.maxWidth - 2 * padding - bar;
  const titleWidth = title.length * titleSize * fit.headlineGlyph;
  const bodyWidth = (subtitle?.length ?? 0) * bodySize * fit.bodyGlyph;
  const line = typeTokens.lineHeight;
  const lines =
    wrappedLines(title.length, titleSize * fit.headlineGlyph, inner) *
      titleSize *
      line +
    (subtitle
      ? gap +
        wrappedLines(subtitle.length, bodySize * fit.bodyGlyph, inner) *
          bodySize *
          line
      : 0);
  return {
    width: Math.min(
      fit.maxWidth,
      Math.max(
        fit.minWidth,
        Math.max(titleWidth, bodyWidth) + 2 * padding + bar,
      ),
    ),
    height: lines + 2 * padding,
  };
};

/** Screen box of lon/lat bounds, from its projected corners. */
export const boundsBox = (
  bounds: [number, number, number, number],
  toScreen: (lonLat: [number, number]) => { x: number; y: number },
): Box => {
  const [w, s, e, n] = bounds;
  const points = (
    [
      [w, s],
      [w, n],
      [e, s],
      [e, n],
    ] as [number, number][]
  ).map(toScreen);
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
};

/** The corner for a card, from the subject's screen box sampled over the card's whole life. */
export const autoCorner = (
  bounds: [number, number, number, number],
  size: Size,
  W: number,
  H: number,
  fromFrame: number,
  frames: number,
  toScreenAt: (
    frame: number,
  ) => (lonLat: [number, number]) => { x: number; y: number },
) => {
  const subjects: Box[] = [];
  for (let f = 0; f < frames; f += textLayer.fit.sampleEvery)
    subjects.push(boundsBox(bounds, toScreenAt(fromFrame + f)));
  subjects.push(boundsBox(bounds, toScreenAt(fromFrame + frames - 1)));
  return { ...pickCorner(subjects, size, W, H), subjects };
};

/** Upper bound of a BigDate's size before layout, for a four-digit year with an era. */
export const bigDateSize = (caption?: string): Size => {
  const { fit, padding, dateSize, eraSize, bodySize, gap } = textLayer;
  const line = typeTokens.lineHeight;
  const date =
    4 * dateSize * fit.headlineGlyph + 2 * eraSize * fit.headlineGlyph;
  const body = (caption?.length ?? 0) * bodySize * fit.bodyGlyph;
  return {
    width: Math.max(fit.minWidth, Math.max(date, body) + 2 * padding),
    height:
      dateSize * line + (caption ? gap + bodySize * line : 0) + 2 * padding,
  };
};
