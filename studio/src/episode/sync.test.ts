import { describe, expect, it } from "vitest";
import { z } from "zod";
import { motion, voiceSync } from "../design/tokens";
import { storyboardSchema } from "../storyboard/schema";
import { wordsSchema } from "./plan";
import {
  detectPauses,
  resolveAnchor,
  resolveStoryboard,
  snapCut,
} from "./sync";
import { buildCamera } from "./camera";
import plate from "../../public/plates/china-east-hs05.json";
import type { PlateMeta } from "../geo/plate";

const aligned = (
  entries: { text: string; start: number; end: number }[],
  duration = 10,
) =>
  wordsSchema.parse({
    complete: true,
    audio_sha256: "0".repeat(64),
    duration,
    words: entries.map((word, index) => ({
      ...word,
      index,
      status: "matched",
    })),
  });
const words = aligned([
  { text: "A.", start: 0.1, end: 2.1 },
  { text: "B.", start: 6.1, end: 8.1 },
]);
const story = (): z.input<typeof storyboardSchema> => ({
  schemaVersion: 1,
  episode: { slug: "test", title: "Test", language: "en", fps: 30 },
  audio: { src: "voice.wav", words: "words.json" },
  plates: [{ id: "china", name: "china-east-hs05" }],
  shots: [
    {
      id: "a",
      plate: "china",
      start: { time: 0 },
      end: { word: 0 },
      camera: { preset: "hold", params: {} },
      layers: [],
      // Scene metadata, not CSS animation.
      // eslint-disable-next-line @remotion/non-pure-animation
      transition: { kind: "crossfade" },
    },
    {
      id: "b",
      plate: "china",
      start: { word: 1 },
      end: { time: 10 },
      camera: { preset: "hold", params: {} },
      layers: [],
    },
  ],
});
const waveform = (duration: number, speech: [number, number][]) => {
  const samples = new Float32Array(duration * 24000);
  for (const [from, to] of speech)
    samples.fill(0.1, Math.round(from * 24000), Math.round(to * 24000));
  return samples;
};
describe("automatic voice synchronization", () => {
  it("resolves original indices and unique phrases across case, punctuation and numeric commas", () => {
    const data = aligned([
      { text: "Two", start: 0, end: 0.5 },
      { text: "great", start: 0.5, end: 1 },
      { text: "rivers,", start: 1, end: 1.5 },
      { text: "2,000", start: 2, end: 3 },
      { text: "years.", start: 3, end: 4 },
    ]);
    expect(
      resolveAnchor({ phrase: "TWO great rivers" }, data, "start", "$"),
    ).toBe(0);
    expect(
      resolveAnchor({ phrase: "two great rivers" }, data, "end", "$"),
    ).toBe(1.5);
    expect(resolveAnchor({ phrase: "2000 years" }, data, "start", "$")).toBe(2);
    expect(resolveAnchor({ word: 3 }, data, "end", "$")).toBe(3);
  });
  it("fails clearly for ambiguous/missing phrases, invalid indices or out-of-audio times", () => {
    const data = aligned([
      { text: "River", start: 0, end: 1 },
      { text: "river.", start: 1, end: 2 },
    ]);
    expect(() =>
      resolveAnchor({ phrase: "river" }, data, "start", "$.shots[0].start"),
    ).toThrow("ambiguous");
    expect(() =>
      resolveAnchor({ phrase: "missing" }, data, "start", "$"),
    ).toThrow("not found");
    expect(() => resolveAnchor({ word: 9 }, data, "start", "$")).toThrow(
      "does not exist",
    );
    expect(() => resolveAnchor({ time: 11 }, data, "start", "$")).toThrow(
      "exceeds",
    );
  });
  it("detects real quiet runs, ignores short phonetic dips and does not mutate samples", () => {
    const samples = waveform(2, [
      [0, 0.5],
      [0.55, 1],
      [1.3, 2],
    ]);
    const before = samples.slice();
    expect(detectPauses(samples, 24000)).toEqual([{ from: 30, to: 39 }]);
    expect(samples).toEqual(before);
  });
  it("snaps a short-pause cut to its midpoint, respects media endpoints and rejects a distant/no pause", () => {
    expect(snapCut(2.1, [{ from: 60, to: 72 }], 300, 10, "$")).toBe(65);
    expect(snapCut(0, [], 300, 10, "$")).toBe(0);
    expect(snapCut(10, [], 300, 10, "$")).toBe(300);
    expect(() => snapCut(5, [{ from: 60, to: 72 }], 300, 10, "$")).toThrow(
      "No acoustic pause",
    );
    expect(() => snapCut(5, [], 300, 10, "$")).toThrow();
  });
  it("fills long uncovered spans with drift scenes at least the token minimum, preserving transitions and inputs", () => {
    const source = story(),
      before = structuredClone(source);
    const result = resolveStoryboard(
      source,
      words,
      detectPauses(
        waveform(10, [
          [0.1, 2.1],
          [6.1, 8.1],
        ]),
        24000,
      ),
      300,
    );
    expect(result.storyboard.shots.map((s) => s.camera.preset)).toEqual([
      "hold",
      "drift",
      "hold",
    ]);
    expect(result.storyboard.shots[0].transition).toBeUndefined();
    expect(result.storyboard.shots[1].transition?.kind).toBe("crossfade");
    let cursor = 0;
    for (const slot of result.assembly.shots) {
      expect(slot.from).toBe(cursor);
      expect(slot.durationInFrames).toBeGreaterThanOrEqual(
        voiceSync.minShotFrames,
      );
      cursor += slot.durationInFrames;
    }
    expect(cursor).toBe(300);
    expect(source).toEqual(before);
    expect(result.syncReport.shots[1].generated).toBe(true);
  });
  it("fills a sub-minimum gap with a drift camera tail instead of an undersized scene", () => {
    const data = aligned(
      [
        { text: "A.", start: 0.1, end: 2.1 },
        { text: "B.", start: 3.6, end: 6 },
      ],
      8,
    );
    const source = story();
    source.shots[1].end = { time: 8 };
    const result = resolveStoryboard(
      source,
      data,
      detectPauses(
        waveform(8, [
          [0.1, 2.1],
          [3.6, 6],
        ]),
        24000,
      ),
      240,
    );
    expect(result.assembly.shots).toHaveLength(2);
    expect(result.assembly.shots[0].cameraWindow).toBeDefined();
    const timeline = buildCamera(
      result.storyboard,
      result.assembly,
      { china: plate as unknown as PlateMeta },
      1920,
      1080,
    );
    expect(
      timeline.boundaries.some((segment) => segment.name === "drift"),
    ).toBe(true);
  });
  it("applies configurable label lead without moving its end or the audio clock", () => {
    const source = story();
    source.shots = [source.shots[0]];
    delete source.shots[0].transition;
    source.shots[0].end = { time: 10 };
    source.shots[0].layers = [
      {
        id: "date",
        type: "BigDate",
        start: { word: 1 },
        props: { year: 1644 },
      },
    ];
    const a = resolveStoryboard(source, words, [], 300),
      b = resolveStoryboard(source, words, [], 300, { labelLeadFrames: 0 });
    expect(
      b.assembly.shots[0].layers[0].from - a.assembly.shots[0].layers[0].from,
    ).toBe(voiceSync.labelLeadFrames);
    expect(
      a.assembly.shots[0].layers[0].from +
        a.assembly.shots[0].layers[0].durationInFrames,
    ).toBe(300);
    expect(a.assembly.shots[0].durationInFrames).toBe(
      b.assembly.shots[0].durationInFrames,
    );
  });
  it("rejects overlapping authored shots, sub-minimum scenes and out-of-shot layers", () => {
    const overlap = story();
    overlap.shots[0].end = { time: 7 };
    expect(() =>
      resolveStoryboard(overlap, words, [{ from: 180, to: 220 }], 300),
    ).toThrow();
    const short = story();
    short.shots = [short.shots[0]];
    delete short.shots[0].transition;
    short.shots[0].end = { time: 1 };
    expect(() =>
      resolveStoryboard(short, words, [{ from: 27, to: 33 }], 300),
    ).toThrow("token minimum");
    const outside = story();
    outside.shots[0].layers = [
      { id: "bad", type: "BigDate", start: { word: 1 }, props: { year: 1644 } },
    ];
    expect(() =>
      resolveStoryboard(outside, words, [{ from: 63, to: 183 }], 300),
    ).toThrow("inside the authored shot");
  });
  it("fills leading and trailing uncovered time and produces no output past the audio frame count", () => {
    const data = aligned([{ text: "A.", start: 1, end: 3 }], 6);
    const source = story();
    source.shots = [source.shots[0]];
    delete source.shots[0].transition;
    source.shots[0].start = { time: 1 };
    source.shots[0].end = { time: 3 };
    const result = resolveStoryboard(
      source,
      data,
      detectPauses(waveform(6, [[1, 3]]), 24000),
      6 * motion.fps,
    );
    expect(result.assembly.shots[0].from).toBe(0);
    expect(result.assembly.shots[0].cameraWindow?.from).toBeGreaterThan(0);
    expect(
      result.storyboard.shots[result.storyboard.shots.length - 1].camera.preset,
    ).toBe("drift");
    expect(
      result.assembly.shots.reduce((n, s) => n + s.durationInFrames, 0),
    ).toBe(180);
  });
});
