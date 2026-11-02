// Design tokens v0 — the only source of visual values in studio components.
// Draft values; the final palette, type scale and motion land in step 2.1.
import { Easing } from "remotion";

export const colors = {
  background: "#0b0f14",
  /** Primary highlighted region (warm amber). */
  regionA: "#f2a93b",
  /** Secondary / contrasting region (sky blue). */
  regionB: "#4fb3e8",
  /** War, conflict, contested areas. */
  conflict: "#e5484d",
  /** De-emphasised region. */
  neutralRegion: "#c9ced6",
  river: "#8fd0ff",
  riverGlow: "rgba(143, 208, 255, 0.35)",
  /** Brighter colour at the drawing head of a river. */
  riverHead: "#e6f6ff",
  border: "rgba(255, 255, 255, 0.7)",
  labelText: "#f4f1ea",
  labelTextMuted: "#8a96a3",
  labelHalo: "rgba(5, 8, 11, 0.85)",
  /** Colour laid over everything outside a highlighted region. */
  dimOverlay: "#05080b",
  attributionText: "rgba(255, 255, 255, 0.85)",
  attributionBackground: "rgba(0, 0, 0, 0.55)",
  /** Debug/QA markers only. */
  debugMarker: "#ff2d2d",
} as const;

export type RegionColor = "regionA" | "regionB" | "conflict" | "neutral";
export const regionColor: Record<RegionColor, string> = {
  regionA: colors.regionA,
  regionB: colors.regionB,
  conflict: colors.conflict,
  neutral: colors.neutralRegion,
};

/** Stroke widths in on-screen px (constant at any zoom). */
export const stroke = {
  border: 1.5,
  regionOutline: 2.5,
  /** Rivers taper from `min` at the source to `max` at the mouth. */
  river: { min: 1.2, max: 4.5 },
  /** Extra width of the glow under a river. */
  riverGlow: 6,
  labelHalo: 4,
  /** Width multiplier of the bright head of a river being drawn. */
  riverHeadBoost: 1.15,
} as const;

export const type = {
  fontFamily: "Inter",
  fallback: "Arial, Helvetica, sans-serif",
  /** Font sizes in on-screen px. */
  size: {
    labelCity: 26,
    labelRegion: 34,
    labelRiver: 24,
    attribution: 18,
    title: 140,
    subtitle: 32,
    mono: 28,
  },
  lineHeight: 1.2,
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  /** Letter spacing in em. */
  tracking: { region: 0.18, title: 0.08, caps: 0.25 },
} as const;

export const fontStack = `${type.fontFamily}, ${type.fallback}`;
export const monoStack = "Consolas, monospace";

export const opacity = {
  regionFill: 0.35,
  dimOutside: 0.55,
} as const;

export const space = {
  /** Safe area as a fraction of the frame on every side. */
  safeArea: 0.05,
  /** Gap between a city dot and its label, px. */
  labelGap: 10,
  cityDot: 9,
  /** Attribution box inset from the frame corner and its padding, px. */
  attributionInset: 16,
  attributionPadX: 12,
  attributionPadY: 6,
  attributionRadius: 4,
  /** Label entrance slide distance, px. */
  enterShift: 8,
  debugMarker: 12,
  /** Padding around objects framed by the focusOn camera preset, px (inside the safe area). */
  focusPadding: 60,
  /** Gap between a title and its subtitle, px. */
  titleGap: 24,
  /** Inset of corner elements (e.g. frame counter) from the frame edge, px. */
  cornerInsetX: 48,
  cornerInsetY: 40,
} as const;

/** Bezier control points (CSS cubic-bezier) for the standard curves. */
const curves = {
  in: [0.4, 0, 1, 1],
  out: [0, 0, 0.2, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const motion = {
  /** Durations in frames at 30 fps. */
  frames: { fast: 10, base: 18, slow: 30, draw: 120 },
  /** Starting scale of elements that grow in on entrance. */
  enterScale: 0.94,
  curves,
  easing: {
    in: Easing.bezier(...curves.in),
    out: Easing.bezier(...curves.out),
    inOut: Easing.bezier(...curves.inOut),
  },
} as const;
