import { z } from "zod";
import type { GeoCollection, GeoFeature } from "../../geo/geojson";
import { motion, textLayer } from "../../design/tokens";
import { shortText } from "../text/shared";
import { semanticSchema } from "../info/shared";

const point = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-85.051129).max(85.051129),
]);
const line = z.array(point).min(2);
const ring = z
  .array(point)
  .min(4)
  .refine(
    (points) =>
      points[0][0] === points[points.length - 1][0] &&
      points[0][1] === points[points.length - 1][1],
    "Polygon rings must be closed",
  );
const geometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: point }),
  z.object({ type: z.literal("LineString"), coordinates: line }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(ring).min(1)).min(1),
  }),
]);
const feature = z.object({
  type: z.literal("Feature"),
  properties: z.record(z.string(), z.unknown()),
  geometry,
});
const collection = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(feature).min(1),
});
export const historicalLayerSchema = z.strictObject({
  /** data/processed/<plate>/historical/<slug>.geojson of the shot's plate. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** The layer's short credit, exactly as `attribution` on its GeoJSON. */
  credit: shortText(512),
  /** Needed to use a layer whose errata has a blocker. */
  errataOverride: z.strictObject({ reason: shortText(240) }).optional(),
  enterFrames: z
    .number()
    .int()
    .min(1)
    .max(motion.frames.slow * 4)
    .default(motion.frames.slow),
  /** Feature ids to draw; default all. */
  only: z.array(z.string().min(1)).min(1).optional(),
  /** Fill for the drawn features instead of their palette color. */
  color: semanticSchema.optional(),
  /** Frame, from the Sequence start, where the layer starts fading out. */
  exitAt: z.number().int().min(0).optional(),
  exitFrames: z.number().int().min(1).default(motion.frames.slow),
});
export const regionGeoContract = z.union([
  feature.extend({
    geometry: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("Polygon"),
        coordinates: z.array(ring).min(1),
      }),
      z.object({
        type: z.literal("MultiPolygon"),
        coordinates: z.array(z.array(ring).min(1)).min(1),
      }),
    ]),
  }),
  collection.extend({
    features: z
      .array(
        feature.extend({
          geometry: z.discriminatedUnion("type", [
            z.object({
              type: z.literal("Polygon"),
              coordinates: z.array(ring).min(1),
            }),
            z.object({
              type: z.literal("MultiPolygon"),
              coordinates: z.array(z.array(ring).min(1)).min(1),
            }),
          ]),
        }),
      )
      .min(1),
  }),
]);
export const riverGeoContract = collection.extend({
  features: z.tuple([
    feature.extend({
      geometry: z.object({ type: z.literal("LineString"), coordinates: line }),
      properties: z.looseObject({
        cumfrac: z.array(z.number().min(0).max(1)).min(2),
      }),
    }),
  ]),
});
export const routeGeoContract = collection.extend({
  features: z
    .array(
      feature.extend({
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: line,
        }),
        properties: z.looseObject({
          cumfrac: z.array(z.number().min(0).max(1)).min(2),
        }),
      }),
    )
    .min(1),
});
export const regionGeo = z.custom<GeoCollection | GeoFeature>((value) => {
  const p = z.union([collection, feature]).safeParse(value);
  return (
    p.success &&
    (p.data.type === "FeatureCollection" ? p.data.features : [p.data]).every(
      (f) =>
        f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon",
    )
  );
}, "Expected nonempty Polygon/MultiPolygon GeoJSON with closed lon/lat rings");
export const routeGeo = z.custom<GeoCollection>((value) => {
  const p = collection.safeParse(value);
  return (
    p.success &&
    p.data.features.every((f) => {
      const fractions = f.properties.cumfrac;
      return (
        f.geometry.type === "LineString" &&
        Array.isArray(fractions) &&
        fractions.length === f.geometry.coordinates.length &&
        fractions[0] === 0 &&
        fractions[fractions.length - 1] === 1 &&
        fractions.every(
          (n, i) =>
            typeof n === "number" &&
            Number.isFinite(n) &&
            (i === 0 || n >= fractions[i - 1]),
        )
      );
    })
  );
}, "Expected LineStrings with matching nondecreasing cumfrac from 0 to 1");
export const riverGeo = z.custom<GeoCollection>((value) => {
  const p = collection.safeParse(value);
  if (!p.success || p.data.features.length !== 1) return false;
  const f = p.data.features[0],
    fractions = f.properties.cumfrac;
  return (
    f.geometry.type === "LineString" &&
    Array.isArray(fractions) &&
    fractions.length === f.geometry.coordinates.length &&
    fractions[0] === 0 &&
    fractions[fractions.length - 1] === 1 &&
    fractions.every(
      (n, i) =>
        typeof n === "number" &&
        Number.isFinite(n) &&
        n >= 0 &&
        n <= 1 &&
        (i === 0 || n >= fractions[i - 1]),
    )
  );
}, "Expected one LineString with matching nondecreasing cumfrac from 0 to 1");
const frames = z.number().int().min(1);
export const regionHighlightSchema = z.strictObject({
  geojson: regionGeo,
  color: semanticSchema,
  enterFrames: frames.default(motion.frames.slow),
  outline: z.boolean().default(true),
  dimOutside: z.boolean().default(false),
  exitAt: z.number().int().min(0).optional(),
  exitFrames: frames.default(motion.frames.slow),
});
/** Lines fade out at the end of their layer; the episode passes the layer's real duration. */
const lineExit = {
  durationInFrames: frames.default(textLayer.maxDuration),
  /** 0 keeps the line to the last frame, such as at the end of a video. */
  exitFrames: z.number().int().min(0).default(motion.frames.base),
};
export const riverLineSchema = z.strictObject({
  geojson: riverGeo,
  drawFrames: frames.default(motion.frames.draw),
  glow: z.boolean().default(false),
  /** Length fraction already present at the start; only the rest is drawn. */
  fromFraction: z.number().min(0).max(0.95).default(0),
  ...lineExit,
});
export const routeLineSchema = z.strictObject({
  geojson: routeGeo,
  /** Mandatory on-screen credit, shown with the map attribution. */
  credit: shortText(120),
  drawFrames: frames.default(motion.frames.draw),
  style: z.enum(["solid", "dashed"]).default("solid"),
  color: semanticSchema.default("regionA"),
  arrows: z.boolean().default(false),
  /** Era label on the map, e.g. "SUI · 7TH CENTURY". */
  label: z.strictObject({ text: shortText(40), lonLat: point }).optional(),
  nodeAnchors: z.record(z.string(), z.enum(["right", "left"])).default({}),
  ...lineExit,
});
export const arrowAdvanceSchema = z.strictObject({
  /** The course of the advance, origin first. Nodes come from sources, never from memory. */
  path: line,
  color: semanticSchema.default("conflict"),
  drawFrames: frames.default(motion.frames.draw),
  /** dashed says on screen that the course is approximate. */
  style: z.enum(["solid", "dashed"]).default("solid"),
  /** Label at the head, appearing as the arrow arrives. */
  label: shortText(40).optional(),
  ...lineExit,
});
export const arrowRetreatSchema = z.strictObject({
  /**
   * The course of the withdrawal: the line held first, the line fallen back to last, so the
   * first point is where the force stood. Nodes come from sources, never from memory.
   */
  path: line,
  color: semanticSchema.default("conflict"),
  /** Frames over which the ground is let go and the force reaches the line behind. */
  drawFrames: frames.default(motion.frames.draw),
  /** dashed says on screen that the course is approximate. */
  style: z.enum(["solid", "dashed"]).default("solid"),
  /** Label at the line fallen back to, appearing as the withdrawal completes. */
  label: shortText(40).optional(),
  ...lineExit,
});
export const placeLabelSchema = z.strictObject({
  lonLat: point,
  text: shortText(40),
  kind: z.enum(["city", "region", "river"]),
  /** Point the label names when it cannot sit on it; a thin leader is drawn to it. */
  leader: point.optional(),
  /** This label names unmarked ground, such as open desert, so no object is expected. */
  openGround: z.boolean().optional(),
  anchor: z.enum(["right", "left", "top", "bottom", "center"]).optional(),
  enterFrame: z.number().int().min(0).default(0),
  /** Frame, from the Sequence start, where the label starts fading out. */
  exitAt: z.number().int().min(0).optional(),
});
