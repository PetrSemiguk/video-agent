import type { CalculateMetadataFunction } from "remotion";
import { staticFile } from "remotion";
import { cards, motion } from "../design/tokens";
import { fileRefSchema } from "../storyboard/schema";
import type { PlateMeta } from "../geo/plate";
import { compilePlan, wordsSchema } from "./plan";
import { verifyEpisodeCamera } from "./camera";
import { pcmWavInfo, pcmWavSamples } from "./wav";
import { detectPauses, resolveStoryboard } from "./sync";

export type PreparedEpisode = ReturnType<typeof compilePlan> & {
  words: ReturnType<typeof wordsSchema.parse>;
  metas: Record<string, PlateMeta>;
  coverage: ReturnType<typeof verifyEpisodeCamera>;
  syncReport: ReturnType<typeof resolveStoryboard>["syncReport"] | null;
};
export type EpisodeProps = {
  storyboard: unknown;
  words: unknown;
  timing?: unknown;
  sync?: { labelLeadFrames?: number };
  audioSrc: string;
  prepared?: PreparedEpisode;
};
export const calculateEpisodeMetadata: CalculateMetadataFunction<
  EpisodeProps
> = async ({ props, abortSignal }) => {
  const source = fileRefSchema.parse(props.audioSrc);
  const response = await fetch(staticFile(source), { signal: abortSignal });
  if (!response.ok)
    throw new Error(
      `Episode WAV ${source}: HTTP ${response.status}; run prepare:episode`,
    );
  const bytes = await response.arrayBuffer();
  const audio = pcmWavInfo(bytes);
  const words = wordsSchema.parse(props.words);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (
    hash !== words.audio_sha256 ||
    Math.abs(words.duration - audio.duration) > 1 / audio.sampleRate
  )
    throw new Error("Episode WAV/word alignment mismatch");
  const durationInFrames = Math.ceil(
    (audio.samples * motion.fps) / audio.sampleRate,
  );
  const resolved =
    props.timing == null
      ? resolveStoryboard(
          props.storyboard,
          words,
          detectPauses(pcmWavSamples(bytes), audio.sampleRate),
          durationInFrames,
          props.sync ?? {},
        )
      : null;
  const plan =
    resolved ?? compilePlan(props.storyboard, props.timing, durationInFrames);
  const metas = Object.fromEntries(
    await Promise.all(
      plan.storyboard.plates.map(async (plate) => {
        const res = await fetch(staticFile(`plates/${plate.name}.json`), {
          signal: abortSignal,
        });
        if (!res.ok)
          throw new Error(`Episode plate ${plate.name}: HTTP ${res.status}`);
        const meta = (await res.json()) as PlateMeta;
        if (meta.name !== plate.name)
          throw new Error(`Plate metadata name mismatch: ${plate.name}`);
        return [plate.id, meta] as const;
      }),
    ),
  );
  const coverage = verifyEpisodeCamera(
    plan.storyboard,
    plan.assembly,
    metas,
    cards.showreel.width,
    cards.showreel.height,
  );
  console.log(
    "EPISODE_METADATA " +
      JSON.stringify({ durationInFrames, audio, audioSha256: hash, coverage }),
  );
  return {
    durationInFrames,
    fps: motion.fps,
    width: cards.showreel.width,
    height: cards.showreel.height,
    props: {
      ...props,
      prepared: {
        ...plan,
        words,
        metas,
        coverage,
        syncReport: resolved?.syncReport ?? null,
      },
    },
    defaultOutName: plan.storyboard.episode.slug,
  };
};
