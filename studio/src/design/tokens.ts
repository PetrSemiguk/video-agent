// Design tokens v1 - the only source of visual values in studio components and plates.
import { Easing } from "remotion";

export const colors = {
  background: "#0b0f14",
  surface: "#151d26",
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
  labelTextMuted: "#b3bdc8",
  labelHalo: "rgba(5, 8, 11, 0.85)",
  /** Colour laid over everything outside a highlighted region. */
  dimOverlay: "#05080b",
  attributionText: "rgba(244, 241, 234, 0.72)",
  attributionBackground: "rgba(11, 15, 20, 0.28)",
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
  headlineFamily: "Barlow Condensed",
  headlineFile: "fonts/barlowcondensed/BarlowCondensed-Bold.ttf",
  fallback: "Arial, Helvetica, sans-serif",
  /** Font sizes in on-screen px. */
  size: {
    labelCity: 30,
    labelRegion: 44,
    labelRiver: 30,
    attribution: 26,
    title: 140,
    subtitle: 32,
    mono: 28,
  },
  lineHeight: 1.2,
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  /** Letter spacing in em. */
  tracking: { region: 0.08, title: 0.04, caps: 0.18 },
} as const;

export const fontStack = `${type.fontFamily}, ${type.fallback}`;
export const headlineStack = `${type.headlineFamily}, ${type.fallback}`;
export const monoStack = "Consolas, monospace";

export const opacity = {
  regionFill: 0.2,
  dimOutside: 0.24,
} as const;

export const space = {
  /** Safe area as a fraction of the frame on every side. */
  safeArea: 0.05,
  bottomReserve: 0.12,
  grid: 8,
  /** Gap between a city dot and its label, px. */
  labelGap: 10,
  cityDot: 9,
  /** Attribution box inset from the frame corner and its padding, px. */
  attributionInset: 16,
  attributionPadX: 8,
  attributionPadY: 4,
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
  fps: 30,
  stagger: 8,
  spring: { damping: 200 },
  /** Durations in frames at 30 fps. */
  frames: { fast: 10, base: 18, slow: 30, draw: 120 },
  demo: {
    duration: 600,
    yellow: 90,
    yellowDraw: 135,
    yangtze: 240,
    yangtzeDraw: 105,
    heartland: 360,
    heartlandEnter: 36,
    cities: 480,
    cityStagger: 8,
  },
  /** Starting scale of elements that grow in on entrance. */
  enterScale: 0.94,
  curves,
  easing: {
    in: Easing.bezier(...curves.in),
    out: Easing.bezier(...curves.out),
    inOut: Easing.bezier(...curves.inOut),
  },
} as const;

/** Review sheet keeps all three alternatives; Barlow Condensed was selected. */
export const styleReview = {
  width: 1920,
  height: 1080,
  padding: 54,
  gap: 20,
  cardPadding: 28,
  radius: 12,
  surface: "#151d26",
  muted: "#b3bdc8",
  heading: 44,
  caption: 26,
  headline: 64,
  date: 88,
  body: 34,
  rule: 1,
  swatchHeight: 44,
  tracking: "0.04em",
  proposedScale: [26, 34, 44, 64, 100, 140],
  polity: [
    "#b99a62",
    "#7298ad",
    "#a57978",
    "#83a08a",
    "#9a88ae",
    "#ba947b",
    "#789d9e",
    "#a7a56e",
  ],
  candidates: [
    {
      name: "Barlow Condensed",
      family: "Barlow Condensed",
      weight: 700,
      file: "fonts/barlowcondensed/BarlowCondensed-Bold.ttf",
      descriptor: "700",
      note: "01 / Editorial / recommended",
    },
    {
      name: "Oswald",
      family: "Oswald",
      weight: 700,
      file: "fonts/oswald/Oswald[wght].ttf",
      descriptor: "200 700",
      note: "02 / Architectural / compact",
    },
    {
      name: "Anton",
      family: "Anton",
      weight: 400,
      file: "fonts/anton/Anton-Regular.ttf",
      descriptor: "400",
      note: "03 / Poster / emphatic",
    },
  ],
} as const;

// JSON-compatible block consumed by Python; do not add TS expressions inside it.
export const plateLookJson = String.raw`{
  "hillshade": 0.65,
  "grades": {
    "dark": {
      "saturation": 0.62,
      "exposure": 0.78,
      "gamma": 1.18,
      "ocean": {
        "multiply": 0.55,
        "tint": [
          0.03,
          0.06,
          0.09
        ],
        "tint_mix": 0.35,
        "feather_px": 3
      },
      "vignette": {
        "strength": 0.38,
        "inner": 0.55,
        "outer": 1.05
      },
      "land": {
        "midtone_lift": 0.125,
        "mid_start": 0.05,
        "mid_end": 0.3,
        "highlight_start": 0.48,
        "highlight_scale": 0.65
      }
    },
    "neutral": {
      "saturation": 1,
      "exposure": 1,
      "gamma": 1,
      "ocean": {
        "multiply": 1,
        "tint": [
          0,
          0,
          0
        ],
        "tint_mix": 0,
        "feather_px": 0
      },
      "vignette": {
        "strength": 0,
        "inner": 0.55,
        "outer": 1.05
      }
    },
    "dark_v1": {
      "saturation": 0.62,
      "exposure": 0.78,
      "gamma": 1.18,
      "ocean": {
        "multiply": 0.55,
        "tint": [
          0.03,
          0.06,
          0.09
        ],
        "tint_mix": 0.35,
        "feather_px": 3
      },
      "vignette": {
        "strength": 0.38,
        "inner": 0.55,
        "outer": 1.05
      }
    }
  }
}`;

export const polityPalette = styleReview.polity;
export const radii = { card: 12, chip: space.attributionRadius };
export const shadow = { halo: stroke.labelHalo, color: colors.labelHalo };

/** Text layers use native 1080p pixels and never shrink text to fit. */
export const textLayer = {
  maxWidth: 1120,
  padding: 24,
  gap: 16,
  bar: 8,
  radius: 12,
  background: "rgba(11, 15, 20, 0.88)",
  titleSize: 48,
  bodySize: 32,
  tagSize: 34,
  factSize: 44,
  dateSize: 140,
  eraSize: 44,
  defaultDuration: 120,
  maxDuration: 1800,
  limits: {
    title: 64,
    subtitle: 96,
    tag: 32,
    caption: 80,
    statement: 120,
    emphasis: 24,
  },
  review: {
    width: 1920,
    height: 2160,
    padding: 64,
    gap: 24,
    rowHeight: 440,
    labelWidth: 320,
    labelSize: 26,
    titleSize: 44,
    settledFrame: 60,
  },
  demo: { width: 1920, height: 1080, slot: 112, duration: 450 },
} as const;

/** Infographic layout and content budgets at native 1920x1080. */
export const infoLayer = {
  titleSize: 40,
  bodySize: 28,
  smallSize: 26,
  statSize: 88,
  gap: 16,
  smallGap: 8,
  sectionGap: 24,
  valueWidth: 340,
  dateWidth: 180,
  numberWidth: 48,
  barHeight: 16,
  markerSize: 12,
  playheadWidth: 3,
  cardPad: 16,
  cardRadius: 8,
  track: "#273340",
  cardSurface: "#151d26",
  valueLimit: 1_000_000_000_000,
  yearLimit: 9999,
  defaultDuration: 180,
  limits: {
    title: 48,
    label: 48,
    unit: 12,
    item: 80,
    cardTitle: 32,
    cardBody: 80,
    statLabel: 80,
  },
  review: {
    width: 1920,
    height: 4560,
    padding: 64,
    gap: 24,
    labelWidth: 280,
    labelSize: 26,
    frame: 80,
    rows: [900, 900, 880, 860, 440],
  },
  demo: { width: 1920, height: 1080, slot: 120, duration: 600 },
} as const;

export const cards = {
  titleWidth: 1320,
  titleSize: 88,
  subtitleSize: 34,
  kickerSize: 26,
  gap: 24,
  titleLimit: 80,
  subtitleLimit: 120,
  kickerLimit: 32,
  endWidth: 760,
  endTitleSize: 64,
  endTitleLimit: 48,
  endSubtitleLimit: 96,
  endDuration: 600,
  // Project reservations, not official YouTube pixel restrictions.
  endZones: {
    video: { x: 1104, y: 162, width: 640, height: 360 },
    subscribe: { x: 1320, y: 630, width: 240, height: 240 },
  },
  endShade: "rgba(11, 15, 20, 0.82)",
  brollPush: 1.06,
  brollCreditLimit: 80,
  transitionFrames: 24,
  showreel: {
    width: 1920,
    height: 1080,
    duration: 1800,
    content: 1200,
    slot: 120,
    mapSlot: 240,
    brollSlot: 120,
    scenes: [150, 240, 240, 360, 120, 210],
    textSlot: 60,
    infoSlot: 72,
  },
} as const;
