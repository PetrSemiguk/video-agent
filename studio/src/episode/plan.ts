import { z } from "zod";
import { componentRegistry } from "../components/registry";
import { storyboardSchema, type ParsedStoryboard } from "../storyboard/schema";
import { transitionSchema } from "../transitions";
import type { PlateMeta } from "../geo/plate";
import { brollAssets } from "../media/broll";

const frame = z.number().int().min(0);
const duration = z.number().int().min(1);
export const assemblySchema = z.strictObject({
  shots: z
    .array(
      z.strictObject({
        id: z.string(),
        from: frame,
        durationInFrames: duration,
        cameraWindow: z
          .strictObject({ from: frame, durationInFrames: duration })
          .optional(),
        layers: z.array(
          z.strictObject({
            id: z.string(),
            from: frame,
            durationInFrames: duration,
          }),
        ),
      }),
    )
    .min(1),
});
export const wordsSchema = z
  .object({
    complete: z.literal(true),
    audio_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    duration: z.number().positive(),
    words: z
      .array(
        z.object({
          index: frame,
          text: z.string().min(1),
          start: z.number().min(0),
          end: z.number().positive(),
          status: z.literal("matched"),
        }),
      )
      .min(1),
  })
  .superRefine((data, ctx) => {
    let end = 0;
    data.words.forEach((w, i) => {
      if (
        w.index !== i ||
        w.start < end ||
        w.end <= w.start ||
        w.end > data.duration
      )
        ctx.addIssue({
          code: "custom",
          path: ["words", i],
          message:
            "Expected consecutive, ordered positive word spans within audio",
        });
      end = w.end;
    });
  });
export type Assembly = z.infer<typeof assemblySchema>;
export type AlignmentWords = z.infer<typeof wordsSchema>;
export type EpisodeShot = ParsedStoryboard["shots"][number];
export const geoLayerTypes = new Set([
  "RegionHighlight",
  "RiverLine",
  "RouteLine",
  "HistoricalLayer",
]);

export const creditsAt = (
  storyboard: ParsedStoryboard,
  assembly: Assembly,
  metas: Record<string, PlateMeta>,
  frame: number,
) => {
  const active = assembly.shots.findIndex(
    (s) => frame < s.from + s.durationInFrames,
  );
  const index = active < 0 ? assembly.shots.length - 1 : active;
  const shots = [storyboard.shots[index]];
  if (
    index > 0 &&
    frame <
      assembly.shots[index].from + transitionFrames(storyboard.shots[index - 1])
  )
    shots.push(storyboard.shots[index - 1]);
  const sources = new Set(
    shots.map((s) => metas[s.plate].attribution.on_screen),
  );
  for (const shot of shots)
    for (const layer of shot.layers) {
      if (geoLayerTypes.has(layer.type)) sources.add("Made with Natural Earth");
      if (layer.type === "MapAttribution") sources.add(layer.props.text);
      if (layer.type === "HistoricalLayer" || layer.type === "RouteLine")
        sources.add(layer.props.credit);
      if (layer.type === "BRollClip")
        sources.add(brollAssets[layer.props.assetId].credit);
    }
  return [...sources].join(" · ");
};

export const transitionFrames = (shot: EpisodeShot) =>
  !shot.transition || shot.transition.kind === "cut"
    ? 0
    : transitionSchema.parse(shot.transition).durationInFrames;

/**
 * Frames a layer stays mounted. The outgoing scene outlives its shot by the transition, and stays
 * opaque under the incoming one, so a map layer reaching the shot's end holds through the overlap.
 * Otherwise it would vanish at the start of a crossfade while its successor is still transparent.
 * Screen layers run their own exits, and a layer ending earlier ended on purpose.
 */
export const layerFrames = (
  layer: EpisodeShot["layers"][number],
  slot: { from: number; durationInFrames: number },
  shotFrames: number,
  overlap: number,
) =>
  geoLayerTypes.has(layer.type) &&
  slot.from + slot.durationInFrames === shotFrames
    ? slot.durationInFrames + overlap
    : slot.durationInFrames;

export const layerProps = (
  layer: EpisodeShot["layers"][number],
  frames: number,
) => {
  const schema = componentRegistry[layer.type].schema;
  const props = { ...layer.props };
  // Durations must match the actual Sequence window, including omitted defaults.
  return schema.parse(
    "durationInFrames" in props
      ? { ...props, durationInFrames: frames }
      : props,
  );
};

export const compilePlan = (
  story: unknown,
  timing: unknown,
  durationInFrames: number,
) => {
  const storyboard = storyboardSchema.parse(story);
  const assembly = assemblySchema.parse(timing);
  if (assembly.shots.length !== storyboard.shots.length)
    throw new Error("Assembly must schedule every storyboard shot");
  let cursor = 0;
  for (const [i, shot] of storyboard.shots.entries()) {
    const scheduled = assembly.shots[i];
    if (scheduled.id !== shot.id || scheduled.from !== cursor)
      throw new Error(
        `Assembly shot ${shot.id}: supply an ordered, contiguous frame plan`,
      );
    if (scheduled.layers.length !== shot.layers.length)
      throw new Error(`Assembly shot ${shot.id}: schedule every layer`);
    if (
      scheduled.cameraWindow &&
      scheduled.cameraWindow.from + scheduled.cameraWindow.durationInFrames >
        scheduled.durationInFrames
    )
      throw new Error(`Assembly shot ${shot.id}: camera window exceeds scene`);
    shot.layers.forEach((layer, j) => {
      const window = scheduled.layers[j];
      if (
        window.id !== layer.id ||
        window.from + window.durationInFrames > scheduled.durationInFrames
      )
        throw new Error(
          `Assembly layer ${shot.id}/${layer.id}: invalid or out-of-shot window`,
        );
      layerProps(layer, window.durationInFrames);
    });
    const transition = transitionFrames(shot);
    if (
      transition > scheduled.durationInFrames ||
      (transition && transition > assembly.shots[i + 1].durationInFrames)
    )
      throw new Error(
        `Transition after ${shot.id} exceeds a neighboring scene`,
      );
    cursor += scheduled.durationInFrames;
  }
  if (cursor !== durationInFrames)
    throw new Error(
      `Assembly ends at ${cursor}, measured WAV requires ${durationInFrames} frames`,
    );
  return { storyboard, assembly };
};
