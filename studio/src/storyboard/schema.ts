import { z } from "zod";
import { componentRegistry } from "../components/registry";
import { motion } from "../design/tokens";
import { transitionSchema } from "../transitions";
import { shortText } from "../components/text/shared";

const id = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(80);
/** Paths are repository-relative POSIX paths, not URLs or host absolute paths. */
export const fileRefSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_./-]+$/,
    "Use a repository-relative path without traversal, URLs or backslashes",
  );
export const anchorSchema = z.union([
  z.strictObject({ word: z.number().int().min(0) }),
  z.strictObject({ phrase: shortText(240) }),
  z.strictObject({ time: z.number().min(0) }),
]);
const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-85.051129).max(85.051129);
const point = z.tuple([longitude, latitude]);
const target = z.strictObject({
  center: z.strictObject({ lon: longitude, lat: latitude }),
  zoom: z.number().min(0).max(24),
  pitch: z.number().min(0).max(60).optional(),
  bearing: z.number().min(-180).max(180).optional(),
});
const nonnegative = z.number().min(0);
const frames = z.number().int().min(1);
const bounds = z
  .tuple([longitude, latitude, longitude, latitude])
  .refine(
    (b) => b[0] < b[2] && b[1] < b[3],
    "Bounds must be west,south,east,north with positive area",
  );
export const cameraSchema = z.discriminatedUnion("preset", [
  z.strictObject({
    preset: z.literal("establish"),
    params: z.strictObject({
      target,
      push: nonnegative.max(1).optional(),
      drift: z.tuple([z.number(), z.number()]).optional(),
    }),
  }),
  z.strictObject({
    preset: z.literal("drift"),
    params: z.strictObject({
      dir: z.tuple([z.number(), z.number()]).optional(),
      amount: nonnegative.max(1).optional(),
      zoom: z.number().min(-4).max(4).optional(),
    }),
  }),
  z.strictObject({
    preset: z.literal("hold"),
    // A hold over 2 s without a reason fails motion QA (docs/visual-grammar.md).
    params: z.strictObject({ reason: shortText(240).optional() }),
  }),
  z.strictObject({
    preset: z.literal("focusOn"),
    params: z.strictObject({
      bounds,
      padding: nonnegative.optional(),
      tilt: z.number().min(0).max(60).optional(),
      bearing: z.number().min(-180).max(180).optional(),
      maxZoom: z.number().min(0).max(24).optional(),
    }),
  }),
  z.strictObject({
    preset: z.literal("flyTo"),
    params: z.strictObject({
      to: target,
      from: target.optional(),
      rho: z.number().positive().optional(),
      farFrames: nonnegative.optional(),
      samples: z.number().int().min(2).optional(),
    }),
  }),
  z.strictObject({
    preset: z.literal("followLine"),
    params: z.strictObject({
      line: z
        .strictObject({
          points: z.array(point).min(2),
          cumfrac: z.array(z.number().min(0).max(1)).min(2),
        })
        .refine(
          (v) =>
            v.points.length === v.cumfrac.length &&
            v.cumfrac[0] === 0 &&
            v.cumfrac[v.cumfrac.length - 1] === 1 &&
            v.cumfrac.every((n, i) => i === 0 || n >= v.cumfrac[i - 1]),
          "Line requires matching nondecreasing cumfrac from 0 to 1",
        ),
      drawFrames: frames,
      lead: z.number().min(0).max(1).optional(),
      lag: nonnegative.int().optional(),
      smooth: nonnegative.int().optional(),
      zoom: z.number().min(0).max(24).optional(),
      every: frames.optional(),
      pitch: z.number().min(0).max(60).optional(),
      blend: frames.optional(),
    }),
  }),
]);

const layerBase = {
  id,
  start: anchorSchema.optional(),
  end: anchorSchema.optional(),
  /** Ids in the episode's facts.md behind this layer's text; see storyboard/claims.ts. */
  claims: z
    .array(z.string().regex(/^[A-Z]\d{2,}$/))
    .min(1)
    .optional(),
};
// Enumerating tuples keeps the inferred type a real discriminated union. Tests
// enforce exact registry coverage; each props schema is the production instance.
const layer = <N extends keyof typeof componentRegistry>(type: N) =>
  z.strictObject({
    ...layerBase,
    type: z.literal(type),
    props: componentRegistry[type]
      .schema as (typeof componentRegistry)[N]["schema"],
  });
export const layerSchema = z.discriminatedUnion("type", [
  layer("TitleCard"),
  layer("EndCard"),
  layer("BRollClip"),
  layer("LowerThird"),
  layer("SectionTag"),
  layer("BigDate"),
  layer("KeyFact"),
  layer("BarCompare"),
  layer("TimelineBar"),
  layer("NumberedList"),
  layer("RecapCards"),
  layer("StatCounter"),
  layer("RegionHighlight"),
  layer("RiverLine"),
  layer("RouteLine"),
  layer("HistoricalLayer"),
  layer("ArrowAdvance"),
  layer("ArrowRetreat"),
  layer("PlaceLabel"),
  layer("MapAttribution"),
]);
export const shotSchema = z.strictObject({
  id,
  plate: id,
  start: anchorSchema,
  end: anchorSchema,
  /**
   * What the shot is about, as lon/lat bounds [west, south, east, north]. The build checks that
   * it lands in the middle third of the frame, so the subject is not pushed to an edge.
   */
  subject: bounds.optional(),
  camera: cameraSchema,
  layers: z.array(layerSchema),
  // Declarative scene metadata, not a CSS transition or an animation side effect.
  // eslint-disable-next-line @remotion/non-pure-animation
  transition: z
    .union([z.strictObject({ kind: z.literal("cut") }), transitionSchema])
    .optional(),
});
export const storyboardSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    episode: z.strictObject({
      slug: id,
      title: shortText(160),
      language: z.literal("en"),
      fps: z.literal(motion.fps),
    }),
    plates: z.array(z.strictObject({ id, name: id })).min(1),
    audio: z.strictObject({ src: fileRefSchema, words: fileRefSchema }),
    shots: z.array(shotSchema).min(1),
  })
  .superRefine((storyboard, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const plateIds = new Set<string>(),
      shotIds = new Set<string>();
    storyboard.plates.forEach((p, i) => {
      if (plateIds.has(p.id)) issue(["plates", i, "id"], "Duplicate plate id");
      plateIds.add(p.id);
    });
    storyboard.shots.forEach((s, i) => {
      if (shotIds.has(s.id)) issue(["shots", i, "id"], "Duplicate shot id");
      shotIds.add(s.id);
      if (!plateIds.has(s.plate))
        issue(["shots", i, "plate"], "Unknown plate id");
      if (i === storyboard.shots.length - 1 && s.transition)
        issue(
          ["shots", i, "transition"],
          "Final shot cannot transition to a next shot",
        );
      const checkRange = (
        start: z.infer<typeof anchorSchema>,
        end: z.infer<typeof anchorSchema>,
        path: (string | number)[],
      ) => {
        if ("time" in start && "time" in end && end.time <= start.time)
          issue(path, "End time must follow start time");
        if ("word" in start && "word" in end && end.word < start.word)
          issue(path, "End word must not precede start word");
      };
      checkRange(s.start, s.end, ["shots", i, "end"]);
      const ids = new Set<string>();
      s.layers.forEach((l, j) => {
        if (ids.has(l.id))
          issue(["shots", i, "layers", j, "id"], "Duplicate layer id in shot");
        ids.add(l.id);
        if (l.start && l.end)
          checkRange(l.start, l.end, ["shots", i, "layers", j, "end"]);
      });
    });
  });
export type Storyboard = z.input<typeof storyboardSchema>;
export type ParsedStoryboard = z.output<typeof storyboardSchema>;
