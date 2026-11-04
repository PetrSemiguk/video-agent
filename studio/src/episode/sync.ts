import { z } from "zod";
import { motion, voiceSync } from "../design/tokens";
import {
  anchorSchema,
  storyboardSchema,
  type ParsedStoryboard,
} from "../storyboard/schema";
import {
  compilePlan,
  type AlignmentWords,
  type Assembly,
  type EpisodeShot,
} from "./plan";

type Anchor = z.infer<typeof anchorSchema>;
export type Pause = { from: number; to: number };
export const syncOptionsSchema = z.strictObject({
  labelLeadFrames: z
    .number()
    .int()
    .min(0)
    .max(motion.fps)
    .default(voiceSync.labelLeadFrames),
});
const labels = new Set([
  "LowerThird",
  "SectionTag",
  "BigDate",
  "KeyFact",
  "PlaceLabel",
  "BarCompare",
  "TimelineBar",
  "NumberedList",
  "RecapCards",
  "StatCounter",
]);
const lexical = (text: string) =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/’/g, "'")
    .replace(/(\d),(?=\d)/g, "$1")
    .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
const fail = (path: string, message: string): never => {
  throw new Error(`${path}: ${message}`);
};

export const resolveAnchor = (
  anchor: Anchor,
  words: AlignmentWords,
  side: "start" | "end",
  path: string,
) => {
  if ("time" in anchor) {
    if (anchor.time > words.duration)
      fail(path, "Time exceeds the measured narration");
    return anchor.time;
  }
  let first: number, last: number;
  if ("word" in anchor) {
    if (!words.words[anchor.word])
      fail(path, `Original word index ${anchor.word} does not exist`);
    first = last = anchor.word;
  } else {
    const query = lexical(anchor.phrase);
    if (!query.length) fail(path, "Phrase contains no lexical words");
    const flat = words.words.flatMap((word) =>
      lexical(word.text).map((token) => ({ token, index: word.index })),
    );
    const matches = [];
    for (let i = 0; i <= flat.length - query.length; i++)
      if (query.every((token, j) => flat[i + j].token === token))
        matches.push([flat[i].index, flat[i + query.length - 1].index]);
    if (matches.length !== 1)
      fail(
        path,
        matches.length
          ? "Phrase is ambiguous; use explicit word indices"
          : "Phrase not found in original script words",
      );
    [first, last] = matches[0];
  }
  return side === "start" ? words.words[first].start : words.words[last].end;
};

/** Non-overlapping quiet runs measured on the actual mastered PCM waveform. */
export const detectPauses = (
  samples: Float32Array,
  sampleRate: number,
): Pause[] => {
  const window = Math.max(
    1,
    Math.round((sampleRate * voiceSync.silenceWindowMs) / 1000),
  );
  const threshold = 10 ** (voiceSync.silenceThresholdDbfs / 20);
  const pauses: Pause[] = [];
  let start: number | null = null;
  const close = (end: number) => {
    if (start === null) return;
    const from = Math.ceil((start * motion.fps) / sampleRate),
      to = Math.ceil((end * motion.fps) / sampleRate);
    if (to - from >= voiceSync.minPauseFrames) pauses.push({ from, to });
    start = null;
  };
  for (let i = 0; i < samples.length; i += window) {
    const end = Math.min(samples.length, i + window);
    let energy = 0;
    for (let j = i; j < end; j++) energy += samples[j] ** 2;
    if (Math.sqrt(energy / (end - i)) <= threshold) {
      if (start === null) start = i;
    } else close(i);
  }
  close(samples.length);
  return pauses;
};

export const snapCut = (
  seconds: number,
  pauses: Pause[],
  total: number,
  duration: number,
  path: string,
) => {
  if (seconds === 0) return 0;
  if (Math.abs(seconds - duration) < 1e-7) return total;
  const raw = Math.round(seconds * motion.fps);
  const candidates = pauses.map((p) =>
    p.to - p.from > 2 * voiceSync.snapWindowFrames
      ? Math.max(p.from, Math.min(p.to - 1, raw))
      : Math.floor((p.from + p.to - 1) / 2),
  );
  candidates.sort((a, b) => Math.abs(a - raw) - Math.abs(b - raw) || a - b);
  if (
    !candidates.length ||
    Math.abs(candidates[0] - raw) > voiceSync.snapWindowFrames
  )
    fail(path, `No acoustic pause within ${voiceSync.snapWindowFrames} frames`);
  return Math.max(0, Math.min(total, candidates[0]));
};

export const resolveStoryboard = (
  input: unknown,
  words: AlignmentWords,
  pauses: Pause[],
  total: number,
  options: unknown = {},
) => {
  const source = storyboardSchema.parse(input),
    config = syncOptionsSchema.parse(options);
  const runtime: ParsedStoryboard = { ...source, shots: [] };
  const assembly: Assembly = { shots: [] };
  const cuts: {
    id: string;
    rawStart: number;
    rawEnd: number;
    from: number;
    to: number;
  }[] = [];
  const ledgers: {
    id: string;
    generated: boolean;
    text: string;
    from: number;
    durationInFrames: number;
  }[] = [];
  const leads: {
    shot: string;
    layer: string;
    anchorFrame: number;
    from: number;
    leadFrames: number;
  }[] = [];
  const ids = new Set(source.shots.map((s) => s.id));
  let previousRawEnd = 0,
    cursor = 0,
    gapCounter = 0;
  const gap = (end: number, next: EpisodeShot) => {
    const length = end - cursor;
    if (length <= 0) return;
    if (length >= voiceSync.minShotFrames) {
      let id: string;
      do {
        id = `sync-gap-${String(++gapCounter).padStart(3, "0")}`;
      } while (ids.has(id));
      ids.add(id);
      const previous = runtime.shots[runtime.shots.length - 1];
      const transition = previous?.transition;
      if (previous) delete previous.transition;
      runtime.shots.push({
        id,
        plate: previous?.plate ?? next.plate,
        start: { time: cursor / motion.fps },
        end: { time: Math.min(end / motion.fps, words.duration) },
        camera: { preset: "drift", params: {} },
        layers: [],
        // Declarative outgoing-scene metadata, not a CSS transition.
        // eslint-disable-next-line @remotion/non-pure-animation
        ...(transition ? { transition } : {}),
      });
      assembly.shots.push({
        id,
        from: cursor,
        durationInFrames: length,
        layers: [],
      });
    } else if (assembly.shots.length) {
      const previous = assembly.shots[assembly.shots.length - 1];
      previous.cameraWindow ??= {
        from: 0,
        durationInFrames: previous.durationInFrames,
      };
      previous.durationInFrames += length;
    }
    cursor = end;
  };
  source.shots.forEach((shot, i) => {
    const path = `$.shots[${i}]`;
    const rawStart = resolveAnchor(shot.start, words, "start", `${path}.start`);
    const rawEnd = resolveAnchor(shot.end, words, "end", `${path}.end`);
    if (rawStart + 1e-8 < previousRawEnd)
      fail(path, "Authored shot ranges overlap or are out of order");
    if (rawEnd <= rawStart)
      fail(path, "Resolved shot duration must be positive");
    previousRawEnd = rawEnd;
    const from = snapCut(
      rawStart,
      pauses,
      total,
      words.duration,
      `${path}.start`,
    );
    const to = snapCut(rawEnd, pauses, total, words.duration, `${path}.end`);
    if (to - from < voiceSync.minShotFrames)
      fail(
        path,
        `Snapped shot is shorter than token minimum ${voiceSync.minShotFrames} frames`,
      );
    if (from < cursor) fail(path, "Snapped shot ranges overlap");
    cuts.push({ id: shot.id, rawStart, rawEnd, from, to });
    const leadingShort =
      !assembly.shots.length && from - cursor < voiceSync.minShotFrames
        ? from
        : 0;
    if (!leadingShort) gap(from, shot);
    const sceneFrom = leadingShort ? 0 : from;
    const windows = shot.layers.map((layer, j) => {
      const at = `${path}.layers[${j}]`;
      const rawLayerStart = layer.start
        ? resolveAnchor(layer.start, words, "start", `${at}.start`)
        : rawStart;
      const rawLayerEnd = layer.end
        ? resolveAnchor(layer.end, words, "end", `${at}.end`)
        : rawEnd;
      if (
        rawLayerStart < rawStart - 1e-8 ||
        rawLayerEnd > rawEnd + 1e-8 ||
        rawLayerEnd <= rawLayerStart
      )
        fail(
          at,
          "Layer anchors must form a positive range inside the authored shot",
        );
      const anchorFrame = Math.round(rawLayerStart * motion.fps);
      const lead =
        layer.start && labels.has(layer.type) ? config.labelLeadFrames : 0;
      const start = layer.start ? Math.max(from, anchorFrame - lead) : from;
      const end = layer.end
        ? Math.min(to, Math.round(rawLayerEnd * motion.fps))
        : to;
      if (end <= start)
        fail(at, "Layer has no frames after clipping to snapped shot");
      if (lead)
        leads.push({
          shot: shot.id,
          layer: layer.id,
          anchorFrame,
          from: start,
          leadFrames: anchorFrame - start,
        });
      return {
        id: layer.id,
        from: start - sceneFrom,
        durationInFrames: end - start,
      };
    });
    runtime.shots.push(shot);
    assembly.shots.push({
      id: shot.id,
      from: sceneFrom,
      durationInFrames: to - sceneFrom,
      ...(leadingShort
        ? { cameraWindow: { from: leadingShort, durationInFrames: to - from } }
        : {}),
      layers: windows,
    });
    cursor = to;
  });
  gap(total, source.shots[source.shots.length - 1]);
  for (const window of assembly.shots) {
    if (window.durationInFrames < voiceSync.minShotFrames)
      fail("$.shots", "Generated scene violates token minimum");
    const text = words.words
      .filter(
        (w) =>
          w.end > window.from / motion.fps &&
          w.start < (window.from + window.durationInFrames) / motion.fps,
      )
      .map((w) => w.text)
      .join(" ");
    ledgers.push({
      ...window,
      generated: !source.shots.some((s) => s.id === window.id),
      text,
    });
  }
  const plan = compilePlan(runtime, assembly, total);
  return {
    ...plan,
    syncReport: {
      config: { ...voiceSync, ...config },
      pauses,
      cuts,
      leads,
      shots: ledgers,
    },
  };
};
